"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Konva from "konva"
import {
  HandIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react"
import {
  Group,
  Image as KonvaImage,
  Layer as KonvaLayer,
  Rect,
  Stage,
  Text as KonvaText,
  Transformer,
} from "react-konva"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getImageAsset } from "@/lib/asset-registry"
import { useEditorStore } from "@/lib/editor-store"
import { renderPageBackground } from "@/lib/pdf-engine"
import type { EditorLayer, EditorPage } from "@/types/editor"

type PageCanvasProps = {
  page: EditorPage
  width: number
  height: number
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

const WORKSPACE_INSET = 40
const MIN_VISIBLE_PAPER = 48
const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const MAX_WHEEL_DELTA = 100
const PREVIEW_RENDER_DELAY = 120

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
}: {
  layer: EditorLayer
  page: EditorPage
  registerRef: (id: string, node: Konva.Node | null) => void
}) {
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const common = {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
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
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      updateLayer(page.id, layer.id, {
        x: event.target.x(),
        y: event.target.y(),
      })
    },
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      node.scaleX(1)
      node.scaleY(1)
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
        image={asset?.image}
        ref={(node) => registerRef(layer.id, node)}
      />
    )
  }

  return (
    <KonvaText
      {...common}
      text={layer.value}
      fontFamily={layer.fontFamily}
      fontSize={layer.fontSize}
      fontStyle={layer.fontWeight >= 600 ? "bold" : "normal"}
      fill={layer.fill}
      align={layer.align}
      lineHeight={layer.lineHeight}
      wrap="word"
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

export function PageCanvas({ page, width, height }: PageCanvasProps) {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodeRefs = useRef(new Map<string, Konva.Node>())
  const panStartRef = useRef<{
    pointer: { x: number; y: number }
    viewport: Viewport
  } | null>(null)
  const pinchStartRef = useRef<PinchStart | null>(null)
  const [panMode, setPanMode] = useState(false)
  const [spacePressed, setSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)

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

  useEffect(() => {
    const frame = window.requestAnimationFrame(resetView)
    return () => window.cancelAnimationFrame(frame)
  }, [page.id, resetView])

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
      if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        zoomAt({ x: width / 2, y: height / 2 }, 1.2)
      }
      if (event.key === "-") {
        event.preventDefault()
        zoomAt({ x: width / 2, y: height / 2 }, 1 / 1.2)
      }
      if (event.key === "0") {
        event.preventDefault()
        resetView()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false)
    }
    const onBlur = () => {
      setSpacePressed(false)
      setIsPanning(false)
      panStartRef.current = null
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [height, resetView, width, zoomAt])

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

  useEffect(() => {
    const transformer = transformerRef.current
    const selectedNode = selectedLayerId
      ? nodeRefs.current.get(selectedLayerId)
      : undefined
    transformer?.nodes(selectedNode ? [selectedNode] : [])
    transformer?.getLayer()?.batchDraw()
  }, [page.layers, selectedLayerId])

  const selectedLayer = page.layers.find((layer) => layer.id === selectedLayerId)
  const navigationActive = panMode || spacePressed || isPanning
  const zoomPercent = Math.round((viewport.scale / fitScale) * 100)

  const palette = useMemo(() => {
    const styles = getComputedStyle(document.documentElement)
    return {
      paper: styles.getPropertyValue("--paper").trim(),
      primary: styles.getPropertyValue("--primary").trim(),
      shadow: styles.getPropertyValue("--paper-shadow").trim(),
    }
  }, [])

  return (
    <div
      className={
        isPanning
          ? "relative size-full cursor-grabbing overflow-hidden"
          : navigationActive
            ? "relative size-full cursor-grab overflow-hidden"
            : "relative size-full cursor-default overflow-hidden"
      }
      style={{ touchAction: "none" }}
    >
      <Stage
        width={width}
        height={height}
        onContextMenu={(event) => event.evt.preventDefault()}
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
          const wantsPan =
            event.evt.button === 1 ||
            (event.evt.button === 0 && (panMode || spacePressed))

          if (wantsPan && pointer) {
            event.evt.preventDefault()
            panStartRef.current = { pointer, viewport }
            setIsPanning(true)
            return
          }
          if (event.target === stage) selectLayer(null)
        }}
        onMouseMove={(event) => {
          const pointer = event.target.getStage()?.getPointerPosition()
          const start = panStartRef.current
          if (!pointer || !start) return
          setViewport(
            clampViewport({
              ...start.viewport,
              x: start.viewport.x + pointer.x - start.pointer.x,
              y: start.viewport.y + pointer.y - start.pointer.y,
            })
          )
        }}
        onMouseUp={() => {
          panStartRef.current = null
          setIsPanning(false)
        }}
        onMouseLeave={() => {
          panStartRef.current = null
          setIsPanning(false)
        }}
        onTouchStart={(event) => {
          const touches = event.evt.touches
          if (touches.length !== 2) {
            if (event.target === event.target.getStage()) selectLayer(null)
            return
          }
          event.evt.preventDefault()
          event.target.stopDrag()
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
          if (event.evt.touches.length < 2) {
            pinchStartRef.current = null
            setIsPanning(false)
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
        <KonvaLayer listening={!navigationActive}>
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
              />
            ))}
            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio={selectedLayer?.type === "image"}
              flipEnabled={false}
              anchorFill={palette.paper}
              anchorStroke={palette.primary}
              borderStroke={palette.primary}
              anchorSize={8 / viewport.scale}
              borderStrokeWidth={1 / viewport.scale}
              boundBoxFunc={(oldBox, nextBox) =>
                nextBox.width < 12 || nextBox.height < 12 ? oldBox : nextBox
              }
            />
          </Group>
        </KonvaLayer>
      </Stage>

      <div className="canvas-controls" role="toolbar" aria-label="Canvas view">
        <CanvasControl
          label="Pan · Trackpad, Space, or middle mouse"
          aria-pressed={panMode}
          variant={panMode ? "secondary" : "ghost"}
          onClick={() => setPanMode((active) => !active)}
        >
          <HandIcon />
        </CanvasControl>
        <CanvasControl
          label="Zoom out · −"
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
          <TooltipContent>Fit page · 0</TooltipContent>
        </Tooltip>
        <CanvasControl
          label="Zoom in · +"
          disabled={zoomPercent >= MAX_ZOOM * 100}
          onClick={() => zoomAt({ x: width / 2, y: height / 2 }, 1.2)}
        >
          <PlusIcon />
        </CanvasControl>
      </div>
    </div>
  )
}
