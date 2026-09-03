"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Konva from "konva"
import { useHotkeys } from "@tanstack/react-hotkeys"
import {
  BrushIcon,
  ChevronDownIcon,
  CircleIcon,
  CopyIcon,
  HandIcon,
  MoveUpRightIcon,
  MinusIcon,
  MousePointer2Icon,
  PencilIcon,
  PentagonIcon,
  PlusIcon,
  SearchIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react"
import {
  Arrow as KonvaArrow,
  Circle as KonvaCircle,
  Ellipse as KonvaEllipse,
  Group,
  Image as KonvaImage,
  Layer as KonvaLayer,
  Line as KonvaLine,
  Rect,
  Stage,
  Text as KonvaText,
  Transformer,
} from "react-konva"

import { ColorPicker } from "@/components/editor/color-picker"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getImageAsset } from "@/lib/asset-registry"
import {
  appendBrushPoint,
  getBrushGeometry,
  getScaledBrushPoints,
  type BrushPoint,
} from "@/lib/brush-geometry"
import {
  EDITOR_SHORTCUTS,
  formatEditorShortcut,
} from "@/lib/editor-shortcuts"
import { useEditorStore } from "@/lib/editor-store"
import { renderPageBackground } from "@/lib/pdf-engine"
import {
  getDraggedShapeGeometry,
  getPolygonGeometry,
  getScaledShapePoints,
  getShapeName,
  isShapeFillEnabled,
  isShapeStrokeEnabled,
  type ShapePoint,
} from "@/lib/shape-geometry"
import { getTextResizeMode } from "@/lib/text-layout"
import { cn } from "@/lib/utils"
import type {
  BrushLayer,
  EditorLayer,
  EditorPage,
  ShapeKind,
  ShapeLayer,
} from "@/types/editor"

type PageCanvasProps = {
  page: EditorPage
  width: number
  height: number
  onEditLayer?: (layerId: string) => void
  showControls?: boolean
}

type Viewport = {
  x: number
  y: number
  scale: number
}

type PinchStart = {
  distance: number
  pagePoint: { x: number; y: number }
  scale: number
}

type CanvasTool = "select" | "pan" | "zoom"

type PointerGestureStart = {
  pointer: { x: number; y: number }
  viewport: Viewport
}

type DragShapeDraft = {
  shape: Exclude<ShapeKind, "polygon">
  start: ShapePoint
  pointer: ShapePoint
  constrain: boolean
  fromCenter: boolean
}

const WORKSPACE_INSET = 40
const MIN_VISIBLE_PAPER = 48
const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const MAX_WHEEL_DELTA = 100
const ZOOM_DRAG_DISTANCE = 160
const PREVIEW_RENDER_DELAY = 120
const ALL_RESIZE_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-right",
  "bottom-right",
  "bottom-center",
  "bottom-left",
  "middle-left",
]
const HORIZONTAL_RESIZE_ANCHORS = ["middle-left", "middle-right"]
const SHAPE_TOOLS = [
  { value: "rectangle", label: "Rectangle", icon: SquareIcon },
  { value: "ellipse", label: "Ellipse", icon: CircleIcon },
  { value: "line", label: "Line", icon: MinusIcon },
  { value: "arrow", label: "Arrow", icon: MoveUpRightIcon },
  { value: "polygon", label: "Polygon", icon: PentagonIcon },
] as const satisfies ReadonlyArray<{
  value: ShapeKind
  label: string
  icon: typeof SquareIcon
}>

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay)
    return () => window.clearTimeout(timeout)
  }, [delay, value])

  return debouncedValue
}

function getWheelDelta(event: WheelEvent, viewportHeight: number) {
  const modeScale =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? viewportHeight
        : 1
  const deltaX = event.deltaX * modeScale
  const deltaY = event.deltaY * modeScale

  if (event.shiftKey && deltaX === 0) return { x: deltaY, y: 0 }
  return { x: deltaX, y: deltaY }
}

function getWheelZoomFactor(deltaY: number) {
  const normalizedDelta = Math.min(
    MAX_WHEEL_DELTA,
    Math.max(-MAX_WHEEL_DELTA, deltaY)
  )
  if (normalizedDelta === 0) return 1

  const sensitivity =
    0.0025 + 0.002 / (1 + Math.abs(normalizedDelta) / 12)
  return Math.exp(-normalizedDelta * sensitivity)
}

function useBackground(page: EditorPage, scale: number) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const { background, heightPt, rotation, widthPt } = page

  useEffect(() => {
    let cancelled = false
    let rendered: HTMLCanvasElement | null = null

    void renderPageBackground(
      {
        id: "preview",
        name: "Preview",
        background,
        heightPt,
        widthPt,
        rotation,
        layers: [],
      },
      scale
    )
      .then((nextCanvas) => {
        rendered = nextCanvas
        if (!cancelled) setCanvas(nextCanvas)
      })
      .catch(() => {
        if (!cancelled) setCanvas(null)
      })

    return () => {
      cancelled = true
      if (rendered) {
        rendered.width = 1
        rendered.height = 1
      }
    }
  }, [background, heightPt, rotation, scale, widthPt])

  return canvas
}

function CanvasLayerNode({
  layer,
  page,
  registerRef,
  onEditLayer,
}: {
  layer: EditorLayer
  page: EditorPage
  registerRef: (id: string, node: Konva.Node | null) => void
  onEditLayer?: (layerId: string) => void
}) {
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const textResizeMode = layer.type === "text" ? getTextResizeMode(layer) : null
  const textDimensions =
    layer.type !== "text" || textResizeMode === "auto-width"
      ? {}
      : textResizeMode === "auto-height"
        ? { width: layer.width }
        : { width: layer.width, height: layer.height }
  const common = {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked,
    onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.cancelBubble = true
      selectLayer(layer.id)
    },
    onTap: (event: Konva.KonvaEventObject<TouchEvent>) => {
      event.cancelBubble = true
      selectLayer(layer.id)
    },
    onDblClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.cancelBubble = true
      selectLayer(layer.id)
      onEditLayer?.(layer.id)
    },
    onDblTap: (event: Konva.KonvaEventObject<TouchEvent>) => {
      event.cancelBubble = true
      selectLayer(layer.id)
      onEditLayer?.(layer.id)
    },
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      updateLayer(page.id, layer.id, {
        x: event.target.x(),
        y: event.target.y(),
      })
    },
    onTransform: (event: Konva.KonvaEventObject<Event>) => {
      if (layer.type !== "text" || textResizeMode === "auto-width") return

      const node = event.target as Konva.Text
      const width = Math.max(12, node.width() * node.scaleX())
      const height = Math.max(12, node.height() * node.scaleY())
      node.scaleX(1)
      node.scaleY(1)
      node.width(width)
      if (textResizeMode === "fixed") node.height(height)
    },
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      node.scaleX(1)
      node.scaleY(1)

      if (layer.type === "text") {
        updateLayer(page.id, layer.id, {
          x: node.x(),
          y: node.y(),
          width: Math.max(12, node.width() * scaleX),
          height: Math.max(12, node.height() * scaleY),
          rotation: node.rotation(),
        })
        return
      }

      updateLayer(page.id, layer.id, {
        x: node.x(),
        y: node.y(),
        width: Math.max(12, node.width() * scaleX),
        height: Math.max(12, node.height() * scaleY),
        rotation: node.rotation(),
      })
    },
  }

  if (layer.type === "image") {
    const asset = getImageAsset(layer.assetId)
    return (
      <KonvaImage
        {...common}
        width={layer.width}
        height={layer.height}
        image={asset?.image}
        ref={(node) => registerRef(layer.id, node)}
      />
    )
  }

  if (layer.type === "brush") {
    const points = getScaledBrushPoints(layer)
    return (
      <Group
        {...common}
        width={layer.width}
        height={layer.height}
        ref={(node) => registerRef(layer.id, node)}
      >
        {points.length <= 2 ? (
          <KonvaCircle
            x={points[0] ?? layer.width / 2}
            y={points[1] ?? layer.height / 2}
            radius={layer.strokeWidth / 2}
            fill={layer.color}
          />
        ) : (
          <KonvaLine
            points={points}
            stroke={layer.color}
            strokeWidth={layer.strokeWidth}
            strokeScaleEnabled={false}
            lineCap="round"
            lineJoin="round"
            hitStrokeWidth={Math.max(10, layer.strokeWidth)}
          />
        )}
      </Group>
    )
  }

  if (layer.type === "shape") {
    const fillEnabled = isShapeFillEnabled(layer)
    const strokeEnabled = isShapeStrokeEnabled(layer)
    const shapeStyle = {
      fill: fillEnabled ? (layer.fill ?? undefined) : undefined,
      stroke: strokeEnabled ? (layer.stroke ?? undefined) : undefined,
      strokeWidth: layer.strokeWidth,
      strokeScaleEnabled: false,
      hitStrokeWidth: Math.max(10, layer.strokeWidth),
    }
    const points = getScaledShapePoints(layer)

    return (
      <Group
        {...common}
        width={layer.width}
        height={layer.height}
        ref={(node) => registerRef(layer.id, node)}
      >
        {layer.shape === "rectangle" ? (
          <Rect {...shapeStyle} width={layer.width} height={layer.height} />
        ) : layer.shape === "ellipse" ? (
          <KonvaEllipse
            {...shapeStyle}
            x={layer.width / 2}
            y={layer.height / 2}
            radiusX={layer.width / 2}
            radiusY={layer.height / 2}
          />
        ) : layer.shape === "arrow" ? (
          <KonvaArrow
            {...shapeStyle}
            fill={strokeEnabled ? (layer.stroke ?? undefined) : undefined}
            points={points}
            pointerLength={Math.max(8, layer.strokeWidth * 5)}
            pointerWidth={Math.max(8, layer.strokeWidth * 5)}
          />
        ) : (
          <KonvaLine
            {...shapeStyle}
            points={points}
            closed={layer.shape === "polygon"}
          />
        )}
      </Group>
    )
  }

  return (
    <KonvaText
      {...common}
      {...textDimensions}
      text={layer.value}
      fontFamily={layer.fontFamily}
      fontSize={layer.fontSize}
      fontStyle={layer.fontWeight >= 600 ? "bold" : "normal"}
      fill={layer.fill}
      align={layer.align}
      lineHeight={layer.lineHeight}
      wrap={textResizeMode === "auto-width" ? "none" : "word"}
      verticalAlign="top"
      ref={(node) => registerRef(layer.id, node)}
    />
  )
}

function CanvasControl({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  const button = (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      {...props}
    >
      {children}
    </Button>
  )

  if (props.disabled) return button

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function CanvasToolControl({
  label,
  value,
  children,
}: {
  label: string
  value: CanvasTool
  children: React.ReactNode
}) {
  const item = (
    <ToggleGroupItem value={value} aria-label={label}>
      {children}
    </ToggleGroupItem>
  )

  return (
    <Tooltip>
      <TooltipTrigger render={item} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function getTouchCenter(touches: TouchList) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  }
}

function getTouchDistance(touches: TouchList) {
  return Math.hypot(
    touches[1].clientX - touches[0].clientX,
    touches[1].clientY - touches[0].clientY
  )
}

export function PageCanvas({
  page,
  width,
  height,
  onEditLayer,
  showControls = true,
}: PageCanvasProps) {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const addLayer = useEditorStore((state) => state.addLayer)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const deleteLayer = useEditorStore((state) => state.deleteLayer)
  const setRenamingLayer = useEditorStore((state) => state.setRenamingLayer)
  const [contextLayerId, setContextLayerId] = useState<string | null>(null)
  const drawingTool = useEditorStore((state) => state.drawingTool)
  const setDrawingTool = useEditorStore((state) => state.setDrawingTool)
  const setDrawingGestureActive = useEditorStore(
    (state) => state.setDrawingGestureActive
  )
  const brushColor = useEditorStore((state) => state.brushColor)
  const brushWidth = useEditorStore((state) => state.brushWidth)
  const setBrushColor = useEditorStore((state) => state.setBrushColor)
  const setBrushWidth = useEditorStore((state) => state.setBrushWidth)
  const shapeKind = useEditorStore((state) => state.shapeKind)
  const shapeFill = useEditorStore((state) => state.shapeFill)
  const shapeFillEnabled = useEditorStore((state) => state.shapeFillEnabled)
  const shapeStroke = useEditorStore((state) => state.shapeStroke)
  const shapeStrokeEnabled = useEditorStore(
    (state) => state.shapeStrokeEnabled
  )
  const shapeStrokeWidth = useEditorStore((state) => state.shapeStrokeWidth)
  const setShapeKind = useEditorStore((state) => state.setShapeKind)
  const setShapeFill = useEditorStore((state) => state.setShapeFill)
  const setShapeFillEnabled = useEditorStore(
    (state) => state.setShapeFillEnabled
  )
  const setShapeStroke = useEditorStore((state) => state.setShapeStroke)
  const setShapeStrokeEnabled = useEditorStore(
    (state) => state.setShapeStrokeEnabled
  )
  const setShapeStrokeWidth = useEditorStore(
    (state) => state.setShapeStrokeWidth
  )
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodeRefs = useRef(new Map<string, Konva.Node>())
  const panStartRef = useRef<{
    pointer: { x: number; y: number }
    viewport: Viewport
  } | null>(null)
  const zoomDragStartRef = useRef<PointerGestureStart | null>(null)
  const pinchStartRef = useRef<PinchStart | null>(null)
  const [tool, setTool] = useState<CanvasTool>("select")
  const [spacePressed, setSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [isZoomDragging, setIsZoomDragging] = useState(false)
  const [dragShapeDraft, setDragShapeDraft] =
    useState<DragShapeDraft | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<ShapePoint[]>([])
  const [polygonPointer, setPolygonPointer] = useState<ShapePoint | null>(null)
  const [brushDraft, setBrushDraft] = useState<BrushPoint[]>([])

  const fitScale = useMemo(
    () =>
      Math.max(
        0.05,
        Math.min(
          (width - WORKSPACE_INSET * 2) / page.widthPt,
          (height - WORKSPACE_INSET * 2) / page.heightPt
        )
      ),
    [height, page.heightPt, page.widthPt, width]
  )

  const fitViewport = useCallback(
    (): Viewport => ({
      x: (width - page.widthPt * fitScale) / 2,
      y: (height - page.heightPt * fitScale) / 2,
      scale: fitScale,
    }),
    [fitScale, height, page.heightPt, page.widthPt, width]
  )

  const [viewport, setViewport] = useState<Viewport>(() => fitViewport())

  const clampViewport = useCallback(
    (next: Viewport): Viewport => {
      const paperWidth = page.widthPt * next.scale
      const paperHeight = page.heightPt * next.scale
      const clampAxis = (
        position: number,
        paperSize: number,
        viewportSize: number
      ) => {
        return Math.min(
          viewportSize - MIN_VISIBLE_PAPER,
          Math.max(MIN_VISIBLE_PAPER - paperSize, position)
        )
      }

      return {
        ...next,
        x: clampAxis(next.x, paperWidth, width),
        y: clampAxis(next.y, paperHeight, height),
      }
    },
    [height, page.heightPt, page.widthPt, width]
  )

  const resetView = useCallback(() => {
    setViewport(fitViewport())
  }, [fitViewport])

  const resetToActualSize = useCallback(() => {
    setViewport(
      clampViewport({
        x: width / 2 - page.widthPt / 2,
        y: height / 2 - page.heightPt / 2,
        scale: 1,
      })
    )
  }, [clampViewport, height, page.heightPt, page.widthPt, width])

  const getPagePoint = useCallback(
    (pointer: ShapePoint): ShapePoint => ({
      x: Math.min(
        page.widthPt,
        Math.max(0, (pointer.x - viewport.x) / viewport.scale)
      ),
      y: Math.min(
        page.heightPt,
        Math.max(0, (pointer.y - viewport.y) / viewport.scale)
      ),
    }),
    [page.heightPt, page.widthPt, viewport]
  )

  const addShapeLayer = useCallback(
    (
      shape: ShapeKind,
      geometry: ReturnType<typeof getDraggedShapeGeometry>
    ) => {
      const layer: ShapeLayer = {
        id: crypto.randomUUID(),
        type: "shape",
        shape,
        name: getShapeName(shape),
        ...geometry,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        fill: shapeFill,
        fillEnabled: shapeFillEnabled,
        stroke: shapeStroke,
        strokeEnabled: shapeStrokeEnabled,
        strokeWidth: shapeStrokeWidth,
      }
      addLayer(page.id, layer)
    },
    [
      addLayer,
      page.id,
      shapeFill,
      shapeFillEnabled,
      shapeStroke,
      shapeStrokeEnabled,
      shapeStrokeWidth,
    ]
  )

  const completePolygon = useCallback(() => {
    const geometry = getPolygonGeometry(polygonPoints)
    if (!geometry) return
    addShapeLayer("polygon", geometry)
    setPolygonPoints([])
    setPolygonPointer(null)
    setDrawingGestureActive(false)
  }, [addShapeLayer, polygonPoints, setDrawingGestureActive])

  const completeBrushStroke = useCallback(() => {
    const geometry = getBrushGeometry(brushDraft, brushWidth)
    if (!geometry) return
    const layer: BrushLayer = {
      id: crypto.randomUUID(),
      type: "brush",
      name: "Brush",
      ...geometry,
      color: brushColor,
      strokeWidth: brushWidth,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
    }
    addLayer(page.id, layer)
    setBrushDraft([])
    setDrawingGestureActive(false)
  }, [
    addLayer,
    brushColor,
    brushDraft,
    brushWidth,
    page.id,
    setDrawingGestureActive,
  ])

  const cancelDrawing = useCallback(() => {
    setDragShapeDraft(null)
    setPolygonPoints([])
    setPolygonPointer(null)
    setBrushDraft([])
    setDrawingGestureActive(false)
    setDrawingTool(null)
    setTool("select")
  }, [setDrawingGestureActive, setDrawingTool])

  useEffect(() => {
    const frame = window.requestAnimationFrame(resetView)
    return () => window.cancelAnimationFrame(frame)
  }, [page.id, resetView])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDragShapeDraft(null)
      setPolygonPoints([])
      setPolygonPointer(null)
      setBrushDraft([])
    })
    return () => window.cancelAnimationFrame(frame)
  }, [drawingTool, page.id])

  useEffect(() => {
    setDrawingGestureActive(false)
  }, [page.id, setDrawingGestureActive])

  const zoomAt = useCallback(
    (point: { x: number; y: number }, factor: number) => {
      setViewport((current) => {
        const zoom = current.scale / fitScale
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
        const nextScale = fitScale * nextZoom
        const pagePoint = {
          x: (point.x - current.x) / current.scale,
          y: (point.y - current.y) / current.scale,
        }
        return clampViewport({
          x: point.x - pagePoint.x * nextScale,
          y: point.y - pagePoint.y * nextScale,
          scale: nextScale,
        })
      })
    },
    [clampViewport, fitScale]
  )

  const updatePan = useCallback(
    (pointer: { x: number; y: number }) => {
      const start = panStartRef.current
      if (!start) return
      setViewport(
        clampViewport({
          ...start.viewport,
          x: start.viewport.x + pointer.x - start.pointer.x,
          y: start.viewport.y + pointer.y - start.pointer.y,
        })
      )
    },
    [clampViewport]
  )

  const updateZoomDrag = useCallback(
    (pointer: { x: number; y: number }) => {
      const start = zoomDragStartRef.current
      if (!start) return

      const startZoom = start.viewport.scale / fitScale
      const factor = Math.pow(
        2,
        (start.pointer.y - pointer.y) / ZOOM_DRAG_DISTANCE
      )
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, startZoom * factor)
      )
      const nextScale = fitScale * nextZoom
      const pagePoint = {
        x: (start.pointer.x - start.viewport.x) / start.viewport.scale,
        y: (start.pointer.y - start.viewport.y) / start.viewport.scale,
      }

      setViewport(
        clampViewport({
          x: start.pointer.x - pagePoint.x * nextScale,
          y: start.pointer.y - pagePoint.y * nextScale,
          scale: nextScale,
        })
      )
    },
    [clampViewport, fitScale]
  )

  const endPointerGesture = useCallback(() => {
    panStartRef.current = null
    zoomDragStartRef.current = null
    setIsPanning(false)
    setIsZoomDragging(false)
  }, [])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      target.matches("input, textarea, select, [contenteditable=true]")

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.code === "Space") {
        event.preventDefault()
        setSpacePressed(true)
      }
      if (event.key === "Escape" && drawingTool) {
        event.preventDefault()
        cancelDrawing()
      }
      if (event.key === "Enter" && drawingTool === "polygon") {
        event.preventDefault()
        completePolygon()
      }
      if (
        event.key === "Backspace" &&
        drawingTool === "polygon" &&
        polygonPoints.length > 0
      ) {
        event.preventDefault()
        if (polygonPoints.length === 1) setDrawingGestureActive(false)
        setPolygonPoints((points) => points.slice(0, -1))
      }
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        (event.key === "+" || event.key === "=")
      ) {
        event.preventDefault()
        zoomAt({ x: width / 2, y: height / 2 }, 1.2)
      }
      if (!event.metaKey && !event.ctrlKey && event.key === "-") {
        event.preventDefault()
        zoomAt({ x: width / 2, y: height / 2 }, 1 / 1.2)
      }
      if (!event.metaKey && !event.ctrlKey && event.key === "0") {
        event.preventDefault()
        resetView()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false)
    }
    const onBlur = () => {
      setSpacePressed(false)
      endPointerGesture()
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [
    cancelDrawing,
    completePolygon,
    drawingTool,
    endPointerGesture,
    height,
    polygonPoints.length,
    resetView,
    setDrawingGestureActive,
    setDrawingTool,
    width,
    zoomAt,
  ])

  useHotkeys(
    [
      {
        hotkey: EDITOR_SHORTCUTS.selectTool,
        callback: () => {
          setTool("select")
          setDrawingTool(null)
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.panTool,
        callback: () => {
          setTool("pan")
          setDrawingTool(null)
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.zoomTool,
        callback: () => {
          setTool("zoom")
          setDrawingTool(null)
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.brushTool,
        callback: () => {
          setTool("select")
          setDrawingTool("brush")
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.shapeTool,
        callback: () => {
          setTool("select")
          setDrawingTool(shapeKind)
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.cycleShapeTool,
        callback: () => {
          const currentIndex = SHAPE_TOOLS.findIndex(
            ({ value }) => value === shapeKind
          )
          const nextShape =
            SHAPE_TOOLS[(currentIndex + 1) % SHAPE_TOOLS.length].value
          setShapeKind(nextShape)
          setTool("select")
          setDrawingTool(nextShape)
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.zoomIn,
        callback: () => zoomAt({ x: width / 2, y: height / 2 }, 1.2),
      },
      {
        hotkey: EDITOR_SHORTCUTS.zoomOut,
        callback: () => zoomAt({ x: width / 2, y: height / 2 }, 1 / 1.2),
      },
      {
        hotkey: EDITOR_SHORTCUTS.fitPage,
        callback: resetView,
      },
      {
        hotkey: EDITOR_SHORTCUTS.actualSize,
        callback: resetToActualSize,
      },
    ],
    {
      ignoreInputs: true,
      preventDefault: true,
      requireReset: true,
      stopPropagation: true,
    }
  )

  const requestedRenderScale = Math.min(
    3,
    Math.max(
      0.5,
      Math.ceil(viewport.scale * window.devicePixelRatio * 2) / 2
    )
  )
  const renderScale = useDebouncedValue(
    requestedRenderScale,
    PREVIEW_RENDER_DELAY
  )
  const background = useBackground(page, renderScale)

  const pointerIsOnPage = useCallback(
    (pointer: ShapePoint) => {
      const pageX = (pointer.x - viewport.x) / viewport.scale
      const pageY = (pointer.y - viewport.y) / viewport.scale
      return (
        pageX >= 0 &&
        pageX <= page.widthPt &&
        pageY >= 0 &&
        pageY <= page.heightPt
      )
    },
    [page.heightPt, page.widthPt, viewport]
  )

  const finishDraggedShape = useCallback(
    (pointer: ShapePoint, constrain: boolean, fromCenter: boolean) => {
      const draft = dragShapeDraft
      if (!draft) return
      let end = getPagePoint(pointer)
      const distance = Math.hypot(
        end.x - draft.start.x,
        end.y - draft.start.y
      )
      if (distance < 3 / viewport.scale) {
        end = {
          x: Math.min(page.widthPt, draft.start.x + 96),
          y: Math.min(
            page.heightPt,
            draft.start.y + (draft.shape === "line" || draft.shape === "arrow" ? 48 : 72)
          ),
        }
      }
      const geometry = getDraggedShapeGeometry(draft.shape, draft.start, end, {
        constrain,
        fromCenter,
      })
      setDragShapeDraft(null)
      setDrawingGestureActive(false)
      addShapeLayer(draft.shape, geometry)
    },
    [
      addShapeLayer,
      dragShapeDraft,
      getPagePoint,
      page.heightPt,
      page.widthPt,
      setDrawingGestureActive,
      viewport.scale,
    ]
  )

  useEffect(() => {
    const transformer = transformerRef.current
    const selectedNode = selectedLayerId
      ? nodeRefs.current.get(selectedLayerId)
      : undefined
    transformer?.nodes(selectedNode ? [selectedNode] : [])
    transformer?.getLayer()?.batchDraw()
  }, [page.layers, selectedLayerId])

  const selectedLayer = page.layers.find((layer) => layer.id === selectedLayerId)
  const contextLayer = page.layers.find((layer) => layer.id === contextLayerId)
  const objectInteractionEnabled =
    tool === "select" &&
    !drawingTool &&
    !spacePressed &&
    !isPanning &&
    !isZoomDragging
  const zoomPercent = Math.round((viewport.scale / fitScale) * 100)

  const palette = useMemo(() => {
    const styles = getComputedStyle(document.documentElement)
    return {
      paper: styles.getPropertyValue("--paper").trim(),
      primary: styles.getPropertyValue("--primary").trim(),
      shadow: styles.getPropertyValue("--paper-shadow").trim(),
    }
  }, [])
  const dragDraftGeometry = dragShapeDraft
    ? getDraggedShapeGeometry(
        dragShapeDraft.shape,
        dragShapeDraft.start,
        dragShapeDraft.pointer,
        {
          constrain: dragShapeDraft.constrain,
          fromCenter: dragShapeDraft.fromCenter,
        }
      )
    : null
  const polygonDraftPoints = [
    ...polygonPoints,
    ...(polygonPointer && polygonPoints.length ? [polygonPointer] : []),
  ].flatMap((point) => [point.x, point.y])
  const brushDraftPoints = brushDraft.flatMap((point) => [point.x, point.y])
  const ActiveShapeIcon =
    SHAPE_TOOLS.find((shape) => shape.value === shapeKind)?.icon ?? SquareIcon
  const shapeToolActive = drawingTool !== null && drawingTool !== "brush"
  const shapeSupportsFill = shapeKind !== "line" && shapeKind !== "arrow"

  return (
    <div
      className={
        isPanning
          ? "relative size-full cursor-grabbing overflow-hidden"
          : isZoomDragging
            ? "relative size-full cursor-ns-resize overflow-hidden"
            : drawingTool
              ? "relative size-full cursor-crosshair overflow-hidden"
              : tool === "pan" || spacePressed
              ? "relative size-full cursor-grab overflow-hidden"
              : tool === "zoom"
                ? "relative size-full cursor-zoom-in overflow-hidden"
                : "relative size-full cursor-default overflow-hidden"
      }
      style={{ touchAction: "none" }}
    >
      <ContextMenu>
        <ContextMenuTrigger className="size-full">
          <Stage
        width={width}
        height={height}
        onContextMenu={(event) => {
          const stage = event.target.getStage()
          let node: Konva.Node | null = event.target
          let targetLayerId: string | null = null

          while (node && node !== stage) {
            const nodeId = node.id()
            if (page.layers.some((layer) => layer.id === nodeId)) {
              targetLayerId = nodeId
              break
            }
            if (node === transformerRef.current) {
              targetLayerId = selectedLayerId
              break
            }
            node = node.getParent()
          }

          if (!targetLayerId) {
            event.evt.preventDefault()
            event.evt.stopPropagation()
            setContextLayerId(null)
            return
          }

          selectLayer(targetLayerId)
          setContextLayerId(targetLayerId)
        }}
        onWheel={(event) => {
          event.evt.preventDefault()
          const delta = getWheelDelta(event.evt, height)

          if (event.evt.ctrlKey || event.evt.metaKey) {
            const pointer = event.target.getStage()?.getPointerPosition()
            if (!pointer) return
            zoomAt(pointer, getWheelZoomFactor(delta.y))
            return
          }

          setViewport((current) =>
            clampViewport({
              ...current,
              x: current.x - delta.x,
              y: current.y - delta.y,
            })
          )
        }}
        onMouseDown={(event) => {
          const stage = event.target.getStage()
          const pointer = stage?.getPointerPosition()
          if (
            drawingTool &&
            !spacePressed &&
            event.evt.button === 0 &&
            pointer &&
            pointerIsOnPage(pointer)
          ) {
            event.evt.preventDefault()
            const pagePoint = getPagePoint(pointer)
            setDrawingGestureActive(true)
            if (drawingTool === "brush") {
              setBrushDraft([pagePoint])
            } else if (drawingTool === "polygon") {
              const firstPoint = polygonPoints[0]
              if (
                firstPoint &&
                polygonPoints.length >= 3 &&
                Math.hypot(
                  pagePoint.x - firstPoint.x,
                  pagePoint.y - firstPoint.y
                ) * viewport.scale <= 12
              ) {
                completePolygon()
              } else {
                setPolygonPoints((points) => [...points, pagePoint])
                setPolygonPointer(pagePoint)
              }
            } else {
              setDragShapeDraft({
                shape: drawingTool,
                start: pagePoint,
                pointer: pagePoint,
                constrain: event.evt.shiftKey,
                fromCenter: event.evt.altKey,
              })
            }
            return
          }
          const wantsPan =
            event.evt.button === 1 ||
            (event.evt.button === 0 && (tool === "pan" || spacePressed))

          if (wantsPan && pointer) {
            event.evt.preventDefault()
            panStartRef.current = { pointer, viewport }
            setIsPanning(true)
            return
          }
          if (event.evt.button === 0 && tool === "zoom" && pointer) {
            event.evt.preventDefault()
            zoomDragStartRef.current = { pointer, viewport }
            setIsZoomDragging(true)
            return
          }
          if (tool === "select" && event.target === stage) selectLayer(null)
        }}
        onMouseMove={(event) => {
          const pointer = event.target.getStage()?.getPointerPosition()
          if (!pointer) return
          if (brushDraft.length) {
            const point = getPagePoint(pointer)
            setBrushDraft((points) =>
              appendBrushPoint(points, point, 0.75 / viewport.scale)
            )
            return
          }
          if (dragShapeDraft) {
            setDragShapeDraft((draft) =>
              draft
                ? {
                    ...draft,
                    pointer: getPagePoint(pointer),
                    constrain: event.evt.shiftKey,
                    fromCenter: event.evt.altKey,
                  }
                : null
            )
            return
          }
          if (drawingTool === "polygon" && polygonPoints.length) {
            setPolygonPointer(getPagePoint(pointer))
            return
          }
          if (panStartRef.current) updatePan(pointer)
          else if (zoomDragStartRef.current) updateZoomDrag(pointer)
        }}
        onMouseUp={(event) => {
          const pointer = event.target.getStage()?.getPointerPosition()
          if (brushDraft.length) {
            completeBrushStroke()
            return
          }
          if (dragShapeDraft && pointer) {
            finishDraggedShape(
              pointer,
              event.evt.shiftKey,
              event.evt.altKey
            )
            return
          }
          endPointerGesture()
        }}
        onMouseLeave={(event) => {
          const pointer = event.target.getStage()?.getPointerPosition()
          if (brushDraft.length) {
            completeBrushStroke()
            return
          }
          if (dragShapeDraft && pointer) {
            finishDraggedShape(
              pointer,
              event.evt.shiftKey,
              event.evt.altKey
            )
            return
          }
          endPointerGesture()
        }}
        onTouchStart={(event) => {
          const touches = event.evt.touches
          const stage = event.target.getStage()

          if (touches.length === 1 && drawingTool) {
            const pointer = stage?.getPointerPosition()
            if (!pointer || !pointerIsOnPage(pointer)) return
            event.evt.preventDefault()
            event.target.stopDrag()
            const pagePoint = getPagePoint(pointer)
            setDrawingGestureActive(true)
            if (drawingTool === "brush") {
              setBrushDraft([pagePoint])
            } else if (drawingTool === "polygon") {
              const firstPoint = polygonPoints[0]
              if (
                firstPoint &&
                polygonPoints.length >= 3 &&
                Math.hypot(
                  pagePoint.x - firstPoint.x,
                  pagePoint.y - firstPoint.y
                ) * viewport.scale <= 18
              ) {
                completePolygon()
              } else {
                setPolygonPoints((points) => [...points, pagePoint])
                setPolygonPointer(pagePoint)
              }
            } else {
              setDragShapeDraft({
                shape: drawingTool,
                start: pagePoint,
                pointer: pagePoint,
                constrain: false,
                fromCenter: false,
              })
            }
            return
          }

          if (
            touches.length === 1 &&
            (tool !== "select" || event.target === stage)
          ) {
            const pointer = stage?.getPointerPosition()
            if (!pointer) return
            event.evt.preventDefault()
            event.target.stopDrag()
            if (tool === "pan" || tool === "select") {
              if (tool === "select") selectLayer(null)
              panStartRef.current = { pointer, viewport }
              setIsPanning(true)
            } else {
              zoomDragStartRef.current = { pointer, viewport }
              setIsZoomDragging(true)
            }
            return
          }
          if (touches.length !== 2) {
            return
          }
          if (drawingTool === "brush") {
            setBrushDraft([])
            setDrawingGestureActive(false)
          }
          else if (drawingTool) cancelDrawing()
          event.evt.preventDefault()
          event.target.stopDrag()
          endPointerGesture()
          const stageRect = stage?.container().getBoundingClientRect()
          if (!stageRect) return
          const center = getTouchCenter(touches)
          const stageCenter = {
            x: center.x - stageRect.left,
            y: center.y - stageRect.top,
          }
          pinchStartRef.current = {
            distance: getTouchDistance(touches),
            pagePoint: {
              x: (stageCenter.x - viewport.x) / viewport.scale,
              y: (stageCenter.y - viewport.y) / viewport.scale,
            },
            scale: viewport.scale,
          }
          setIsPanning(true)
        }}
        onTouchMove={(event) => {
          const touches = event.evt.touches
          const start = pinchStartRef.current
          if (touches.length === 1 && brushDraft.length) {
            const pointer = event.target.getStage()?.getPointerPosition()
            if (!pointer) return
            event.evt.preventDefault()
            const point = getPagePoint(pointer)
            setBrushDraft((points) =>
              appendBrushPoint(points, point, 0.75 / viewport.scale)
            )
            return
          }
          if (touches.length === 1 && dragShapeDraft) {
            const pointer = event.target.getStage()?.getPointerPosition()
            if (!pointer) return
            event.evt.preventDefault()
            setDragShapeDraft((draft) =>
              draft ? { ...draft, pointer: getPagePoint(pointer) } : null
            )
            return
          }
          if (
            touches.length === 1 &&
            drawingTool === "polygon" &&
            polygonPoints.length
          ) {
            const pointer = event.target.getStage()?.getPointerPosition()
            if (pointer) setPolygonPointer(getPagePoint(pointer))
            return
          }
          if (touches.length === 1 && !start) {
            const pointer = event.target.getStage()?.getPointerPosition()
            if (!pointer) return
            event.evt.preventDefault()
            if (panStartRef.current) updatePan(pointer)
            else if (zoomDragStartRef.current) updateZoomDrag(pointer)
            return
          }
          if (touches.length !== 2 || !start) return
          event.evt.preventDefault()
          const stageRect = event.target
            .getStage()
            ?.container()
            .getBoundingClientRect()
          if (!stageRect) return
          const center = getTouchCenter(touches)
          const stageCenter = {
            x: center.x - stageRect.left,
            y: center.y - stageRect.top,
          }
          const rawScale =
            start.scale * (getTouchDistance(touches) / start.distance)
          const nextScale = Math.min(
            fitScale * MAX_ZOOM,
            Math.max(fitScale * MIN_ZOOM, rawScale)
          )
          setViewport(
            clampViewport({
              x: stageCenter.x - start.pagePoint.x * nextScale,
              y: stageCenter.y - start.pagePoint.y * nextScale,
              scale: nextScale,
            })
          )
        }}
        onTouchEnd={(event) => {
          if (brushDraft.length && event.evt.touches.length === 0) {
            completeBrushStroke()
            return
          }
          if (dragShapeDraft && event.evt.touches.length === 0) {
            finishDraggedShape(
              {
                x: viewport.x + dragShapeDraft.pointer.x * viewport.scale,
                y: viewport.y + dragShapeDraft.pointer.y * viewport.scale,
              },
              false,
              false
            )
            return
          }
          if (event.evt.touches.length < 2) {
            pinchStartRef.current = null
            endPointerGesture()
          }
        }}
      >
        <KonvaLayer listening={false}>
          <Group
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
          >
            <Rect
              width={page.widthPt}
              height={page.heightPt}
              fill={palette.paper}
              shadowColor={palette.shadow}
              shadowBlur={24 / viewport.scale}
              shadowOffsetY={10 / viewport.scale}
              shadowOpacity={1}
            />
            <KonvaImage
              image={background ?? undefined}
              width={page.widthPt}
              height={page.heightPt}
            />
          </Group>
        </KonvaLayer>
        <KonvaLayer listening={objectInteractionEnabled}>
          <Group
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
          >
            {page.layers.map((layer) => (
              <CanvasLayerNode
                key={layer.id}
                layer={layer}
                page={page}
                registerRef={(id, node) => {
                  if (node) nodeRefs.current.set(id, node)
                  else nodeRefs.current.delete(id)
                }}
                onEditLayer={onEditLayer}
              />
            ))}
            <Transformer
              ref={transformerRef}
              rotateEnabled
              shouldOverdrawWholeArea
              keepRatio={selectedLayer?.type === "image"}
              enabledAnchors={
                selectedLayer?.type === "image" ||
                selectedLayer?.type === "shape" ||
                selectedLayer?.type === "brush"
                  ? ALL_RESIZE_ANCHORS
                  : selectedLayer?.type === "text" &&
                      getTextResizeMode(selectedLayer) === "fixed"
                    ? ALL_RESIZE_ANCHORS
                    : selectedLayer?.type === "text" &&
                        getTextResizeMode(selectedLayer) === "auto-height"
                      ? HORIZONTAL_RESIZE_ANCHORS
                      : []
              }
              flipEnabled={false}
              anchorFill={palette.paper}
              anchorStroke={palette.primary}
              borderStroke={palette.primary}
              anchorSize={8}
              borderStrokeWidth={1}
              boundBoxFunc={(oldBox, nextBox) =>
                nextBox.width < 12 || nextBox.height < 12 ? oldBox : nextBox
              }
            />
          </Group>
        </KonvaLayer>
        {/* Keep the transient preview last so document layers cannot cover it. */}
        <KonvaLayer listening={false}>
          <Group
            x={viewport.x}
            y={viewport.y}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
          >
            {drawingTool === "brush" && brushDraftPoints.length > 0 &&
              (brushDraftPoints.length === 2 ? (
                <KonvaCircle
                  x={brushDraftPoints[0]}
                  y={brushDraftPoints[1]}
                  radius={brushWidth / 2}
                  fill={brushColor}
                />
              ) : (
                <KonvaLine
                  points={brushDraftPoints}
                  stroke={brushColor}
                  strokeWidth={brushWidth}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}
            {dragShapeDraft && dragDraftGeometry && (
              <Group x={dragDraftGeometry.x} y={dragDraftGeometry.y}>
                {dragShapeDraft.shape === "rectangle" ? (
                  <Rect
                    width={dragDraftGeometry.width}
                    height={dragDraftGeometry.height}
                    stroke={palette.primary}
                    strokeWidth={1.5 / viewport.scale}
                  />
                ) : dragShapeDraft.shape === "ellipse" ? (
                  <KonvaEllipse
                    x={dragDraftGeometry.width / 2}
                    y={dragDraftGeometry.height / 2}
                    radiusX={dragDraftGeometry.width / 2}
                    radiusY={dragDraftGeometry.height / 2}
                    stroke={palette.primary}
                    strokeWidth={1.5 / viewport.scale}
                  />
                ) : dragShapeDraft.shape === "arrow" ? (
                  <KonvaArrow
                    points={dragDraftGeometry.points.flatMap((value, index) =>
                      index % 2 === 0
                        ? [value * dragDraftGeometry.width]
                        : [value * dragDraftGeometry.height]
                    )}
                    stroke={palette.primary}
                    fill={palette.primary}
                    strokeWidth={1.5 / viewport.scale}
                    pointerLength={10 / viewport.scale}
                    pointerWidth={10 / viewport.scale}
                  />
                ) : (
                  <KonvaLine
                    points={dragDraftGeometry.points.flatMap((value, index) =>
                      index % 2 === 0
                        ? [value * dragDraftGeometry.width]
                        : [value * dragDraftGeometry.height]
                    )}
                    stroke={palette.primary}
                    strokeWidth={1.5 / viewport.scale}
                  />
                )}
              </Group>
            )}
            {drawingTool === "polygon" && polygonDraftPoints.length >= 2 && (
              <>
                <KonvaLine
                  points={polygonDraftPoints}
                  stroke={palette.primary}
                  strokeWidth={1.5 / viewport.scale}
                  lineJoin="round"
                />
                {polygonPoints.map((point, index) => (
                  <KonvaCircle
                    key={`${point.x}-${point.y}-${index}`}
                    x={point.x}
                    y={point.y}
                    radius={(index === 0 ? 6 : 4) / viewport.scale}
                    fill={palette.paper}
                    stroke={palette.primary}
                    strokeWidth={1.5 / viewport.scale}
                  />
                ))}
              </>
            )}
          </Group>
        </KonvaLayer>
          </Stage>
        </ContextMenuTrigger>
        {contextLayer && (
          <ContextMenuContent>
            <ContextMenuGroup>
              <ContextMenuItem
                onClick={() => {
                  selectLayer(contextLayer.id)
                  setRenamingLayer(contextLayer.id)
                }}
              >
                <PencilIcon /> Rename
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => duplicateLayer(page.id, contextLayer.id)}
              >
                <CopyIcon /> Duplicate
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem
                variant="destructive"
                onClick={() => deleteLayer(page.id, contextLayer.id)}
              >
                <Trash2Icon /> Delete
              </ContextMenuItem>
            </ContextMenuGroup>
          </ContextMenuContent>
        )}
      </ContextMenu>

      {showControls && (
        <div className="canvas-controls" role="toolbar" aria-label="Canvas view">
        <ToggleGroup
          value={drawingTool ? [] : [tool]}
          onValueChange={(value) => {
            const nextTool = value[0] as CanvasTool | undefined
            if (nextTool) {
              setTool(nextTool)
              setDrawingTool(null)
            }
          }}
          spacing={0}
          aria-label="Canvas tools"
        >
          <CanvasToolControl label="Select · V" value="select">
            <MousePointer2Icon />
          </CanvasToolControl>
          <CanvasToolControl label="Pan · H" value="pan">
            <HandIcon />
          </CanvasToolControl>
          <CanvasToolControl label="Zoom · Z" value="zoom">
            <SearchIcon />
          </CanvasToolControl>
        </ToggleGroup>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  drawingTool === "brush" &&
                    "bg-accent text-accent-foreground"
                )}
                aria-label="Brush · B"
                onClick={() => {
                  setTool("select")
                  setDrawingTool("brush")
                }}
              >
                <BrushIcon />
              </Button>
            }
          />
          <TooltipContent>Brush · B</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    shapeToolActive && "bg-accent text-accent-foreground"
                  )}
                  aria-label={`${SHAPE_TOOLS.find(({ value }) => value === shapeKind)?.label ?? "Shape"} · U`}
                  onClick={() => {
                    setTool("select")
                    setDrawingTool(shapeKind)
                  }}
                />
              }
            >
              <ActiveShapeIcon />
            </TooltipTrigger>
            <TooltipContent>
              {SHAPE_TOOLS.find(({ value }) => value === shapeKind)?.label} · U
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className={cn(
                          shapeToolActive &&
                            "bg-accent text-accent-foreground"
                        )}
                        aria-label="Choose shape"
                      />
                    }
                  />
                }
              >
                <ChevronDownIcon />
              </TooltipTrigger>
              <TooltipContent>
                Choose shape ·{" "}
                {formatEditorShortcut(EDITOR_SHORTCUTS.cycleShapeTool)}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuGroup>
                {SHAPE_TOOLS.map(({ value, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => {
                      setShapeKind(value)
                      setTool("select")
                      setDrawingTool(value)
                    }}
                  >
                    <Icon /> {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Separator orientation="vertical" />
        <CanvasControl
          label={`Zoom out · ${formatEditorShortcut(EDITOR_SHORTCUTS.zoomOut)}`}
          disabled={zoomPercent <= MIN_ZOOM * 100}
          onClick={() => zoomAt({ x: width / 2, y: height / 2 }, 1 / 1.2)}
        >
          <MinusIcon />
        </CanvasControl>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="w-14"
                aria-label={`Fit page, current zoom ${zoomPercent}%`}
                onClick={resetView}
              >
                {zoomPercent}%
              </Button>
            }
          />
          <TooltipContent>
            Fit page · {formatEditorShortcut(EDITOR_SHORTCUTS.fitPage)}
          </TooltipContent>
        </Tooltip>
        <CanvasControl
          label={`Zoom in · ${formatEditorShortcut(EDITOR_SHORTCUTS.zoomIn)}`}
          disabled={zoomPercent >= MAX_ZOOM * 100}
          onClick={() => zoomAt({ x: width / 2, y: height / 2 }, 1.2)}
        >
          <PlusIcon />
        </CanvasControl>
        </div>
      )}

      {drawingTool === "brush" && (
        <div
          className="drawing-tool-controls"
          role="toolbar"
          aria-label="Brush settings"
        >
          <ColorPicker
            value={brushColor}
            label="Brush color"
            onValueChange={setBrushColor}
            onValueChangeEnd={() => undefined}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Input
                  type="number"
                  min={0.5}
                  max={144}
                  step={0.5}
                  value={brushWidth}
                  className="h-8 w-16"
                  aria-label="Brush size"
                  onChange={(event) =>
                    setBrushWidth(Number(event.target.value))
                  }
                />
              }
            />
            <TooltipContent>
              Brush size ·{" "}
              {formatEditorShortcut(EDITOR_SHORTCUTS.decreaseBrushSize)} /{" "}
              {formatEditorShortcut(EDITOR_SHORTCUTS.increaseBrushSize)}
            </TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="sm" onClick={cancelDrawing}>
            Done
          </Button>
        </div>
      )}

      {shapeToolActive && (
        <div
          className="drawing-tool-controls"
          role="toolbar"
          aria-label="Shape settings"
        >
          <span className="px-1 text-xs text-muted-foreground">Fill</span>
          <Switch
            checked={shapeFillEnabled}
            disabled={!shapeSupportsFill}
            onCheckedChange={setShapeFillEnabled}
            aria-label="Enable fill"
          />
          <ColorPicker
            value={shapeFill}
            label="Fill color"
            disabled={!shapeSupportsFill || !shapeFillEnabled}
            onValueChange={setShapeFill}
            onValueChangeEnd={() => undefined}
          />
          <Separator orientation="vertical" />
          <span className="px-1 text-xs text-muted-foreground">Stroke</span>
          <Switch
            checked={shapeStrokeEnabled}
            onCheckedChange={setShapeStrokeEnabled}
            aria-label="Enable stroke"
          />
          <ColorPicker
            value={shapeStroke}
            label="Stroke color"
            disabled={!shapeStrokeEnabled}
            onValueChange={setShapeStroke}
            onValueChangeEnd={() => undefined}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Input
                  type="number"
                  min={0.25}
                  max={72}
                  step={0.25}
                  value={shapeStrokeWidth}
                  disabled={!shapeStrokeEnabled}
                  className="h-8 w-16"
                  aria-label="Stroke width"
                  onChange={(event) =>
                    setShapeStrokeWidth(Number(event.target.value))
                  }
                />
              }
            />
            <TooltipContent>Stroke width</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" />
          {drawingTool === "polygon" && polygonPoints.length > 0 ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPolygonPoints([])
                  setPolygonPointer(null)
                  setDrawingGestureActive(false)
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={polygonPoints.length < 3}
                onClick={completePolygon}
              >
                Finish
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={cancelDrawing}>
              Done
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
