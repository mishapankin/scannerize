"use client"

import {
  type ChangeEvent,
  type ComponentProps,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import {
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom"
import { useHotkeys } from "@tanstack/react-hotkeys"
import {
  type LucideIcon,
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BrushIcon,
  CircleIcon,
  ClipboardPasteIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileImageIcon,
  FilePlus2Icon,
  FilesIcon,
  GripVerticalIcon,
  ImagePlusIcon,
  Layers3Icon,
  LockIcon,
  MenuIcon,
  MinusIcon,
  MoveUpRightIcon,
  PencilIcon,
  PentagonIcon,
  PlusIcon,
  Redo2Icon,
  RotateCwIcon,
  SaveIcon,
  ScissorsIcon,
  ScanLineIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  TextCursorInputIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import { useStore } from "zustand"

import { PageCanvas } from "@/components/editor/page-canvas"
import { ColorPicker } from "@/components/editor/color-picker"
import { ExportDialog } from "@/components/editor/export-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Menubar,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar"
import { Progress } from "@/components/ui/progress"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
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
import { registerImage } from "@/lib/asset-registry"
import {
  clearEditorHistory,
  useEditorStore,
} from "@/lib/editor-store"
import {
  EDITOR_SHORTCUTS,
  formatDeleteShortcut,
  formatEditorShortcut,
} from "@/lib/editor-shortcuts"
import { exportDocument, importPdfFile, renderPageComposite } from "@/lib/pdf-engine"
import type { ExportSettings } from "@/lib/export-plan"
import { getTextResizeMode } from "@/lib/text-layout"
import {
  isShapeFillEnabled,
  isShapeStrokeEnabled,
} from "@/lib/shape-geometry"
import { useEditorPersistence } from "@/lib/use-editor-persistence"
import { cn } from "@/lib/utils"
import type {
  EditorLayer,
  EditorPage,
  ShapeKind,
  TextLayer,
  TextResizeMode,
} from "@/types/editor"

type IconButtonProps = ComponentProps<typeof Button> & {
  label: string
}

type MobileDrawerName = "menu" | "pages" | "insert" | "inspector"
type MobileInspectorView = "layers" | "properties"

const MAX_THUMBNAIL_WIDTH = 132
const MAX_THUMBNAIL_HEIGHT = 160
const MAX_THUMBNAIL_SCALE = 0.24
const MAX_THUMBNAIL_PIXEL_RATIO = 2
const SORTABLE_TRANSITION = {
  duration: 220,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
  idle: false,
} as const
const SORTABLE_SENSORS = [
  PointerSensor.configure({
    activationConstraints(event) {
      if (event.pointerType === "touch") {
        return [
          new PointerActivationConstraints.Delay({
            value: 180,
            tolerance: 8,
          }),
        ]
      }

      return [new PointerActivationConstraints.Distance({ value: 5 })]
    },
  }),
  KeyboardSensor,
]
const SHAPE_INSERT_ACTIONS = [
  { value: "rectangle", label: "Rectangle", icon: SquareIcon },
  { value: "ellipse", label: "Ellipse", icon: CircleIcon },
  { value: "line", label: "Line", icon: MinusIcon },
  { value: "arrow", label: "Arrow", icon: MoveUpRightIcon },
  { value: "polygon", label: "Polygon", icon: PentagonIcon },
] as const satisfies ReadonlyArray<{
  value: ShapeKind
  label: string
  icon: LucideIcon
}>

function cloneLayerForClipboard(layer: EditorLayer): EditorLayer {
  return {
    ...layer,
    ...(layer.type === "shape" || layer.type === "brush"
      ? { points: [...layer.points] }
      : {}),
  }
}

function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() =>
    window.matchMedia("(max-width: 899px)").matches
  )

  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)")
    const update = () => setNarrow(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return narrow
}

function IconButton({ label, children, ...props }: IconButtonProps) {
  const button = (
    <Button size="icon-sm" variant="ghost" aria-label={label} {...props}>
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

function PageThumbnail({ page }: { page: EditorPage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLSpanElement>(null)
  const [availableWidth, setAvailableWidth] = useState(MAX_THUMBNAIL_WIDTH)

  const displayScale = Math.min(
    MAX_THUMBNAIL_SCALE,
    availableWidth / page.widthPt,
    MAX_THUMBNAIL_HEIGHT / page.heightPt
  )
  const displayWidth = page.widthPt * displayScale
  const displayHeight = page.heightPt * displayScale

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = (width: number) => {
      setAvailableWidth(
        Math.max(1, Math.min(MAX_THUMBNAIL_WIDTH, Math.floor(width)))
      )
    }
    updateWidth(container.getBoundingClientRect().width)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) updateWidth(entry.contentRect.width)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const pixelRatio = Math.min(
      MAX_THUMBNAIL_PIXEL_RATIO,
      Math.max(1, window.devicePixelRatio || 1)
    )
    void renderPageComposite(page, displayScale * pixelRatio)
      .then((rendered) => {
        const canvas = canvasRef.current
        if (!canvas || cancelled) {
          rendered.width = 1
          rendered.height = 1
          return
        }
        canvas.width = rendered.width
        canvas.height = rendered.height
        const context = canvas.getContext("2d")
        if (context) {
          context.imageSmoothingEnabled = true
          context.imageSmoothingQuality = "high"
          context.drawImage(rendered, 0, 0)
        }
        rendered.width = 1
        rendered.height = 1
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [displayScale, page])

  return (
    <span ref={containerRef} className="flex w-full justify-center">
      <canvas
        ref={canvasRef}
        className="block bg-paper"
        style={{ width: displayWidth, height: displayHeight }}
      />
    </span>
  )
}

function SortablePage({
  page,
  index,
  selected,
  onDelete,
  onSelect,
  mobile = false,
}: {
  page: EditorPage
  index: number
  selected: boolean
  onDelete: (pageId: string) => void
  onSelect?: (pageId: string) => void
  mobile?: boolean
}) {
  const selectPage = useEditorStore((state) => state.selectPage)
  const duplicatePage = useEditorStore((state) => state.duplicatePage)
  const rotatePage = useEditorStore((state) => state.rotatePage)
  const { ref, handleRef, isDragSource } = useSortable({
    id: page.id,
    index,
    type: "page",
    transition: SORTABLE_TRANSITION,
  })

  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={ref}
        className={cn(
          "sortable-item block",
          !mobile && "rounded-lg",
          isDragSource && "opacity-70"
        )}
      >
        <button
          ref={handleRef}
          type="button"
          onClick={() => {
            selectPage(page.id)
            onSelect?.(page.id)
          }}
          className={cn(
            "group w-full cursor-grab text-left outline-none transition-colors active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring",
            mobile
              ? "grid min-h-28 grid-cols-[5rem_1fr] items-center gap-3 rounded-none border-0 px-3 py-2"
              : "flex flex-col gap-2 rounded-lg border bg-workspace p-2 text-workspace-foreground",
            mobile ? "touch-pan-y" : "touch-none",
            selected
              ? mobile
                ? "bg-accent text-accent-foreground"
                : "border-primary"
              : mobile
                ? "bg-popover hover:bg-muted"
                : "border-sidebar-border hover:border-muted-foreground"
          )}
        >
          {mobile ? (
            <>
              <span className="flex h-24 items-center justify-center overflow-hidden">
                <PageThumbnail page={page} />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <GripVerticalIcon
                    className={cn(
                      "size-3",
                      selected
                        ? "text-accent-foreground"
                        : "text-muted-foreground"
                    )}
                  />
                  Page {index + 1}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    selected
                      ? "text-accent-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {Math.round(page.widthPt)} × {Math.round(page.heightPt)} pt
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <GripVerticalIcon
                  className={cn(
                    "size-3",
                    selected
                      ? "text-sidebar-accent-foreground"
                      : "text-muted-foreground"
                  )}
                />
                {index + 1}
                <span
                  className={cn(
                    "ml-auto truncate",
                    selected
                      ? "text-sidebar-accent-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {Math.round(page.widthPt)} × {Math.round(page.heightPt)}
                </span>
              </span>
              <span className="flex min-h-28 items-center justify-center overflow-hidden rounded-md p-2">
                <PageThumbnail page={page} />
              </span>
            </>
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem onClick={() => duplicatePage(page.id)}>
            <CopyIcon /> Duplicate
          </ContextMenuItem>
          <ContextMenuItem onClick={() => rotatePage(page.id)}>
            <RotateCwIcon /> Rotate
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem
            variant="destructive"
            onClick={() => onDelete(page.id)}
          >
            <Trash2Icon /> Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function PageRail({
  onDelete,
  onSelect,
  mobile = false,
}: {
  onDelete: (pageId: string) => void
  onSelect?: (pageId: string) => void
  mobile?: boolean
}) {
  const document = useEditorStore((state) => state.document)
  const selectedPageId = useEditorStore((state) => state.selectedPageId)
  const addBlankPage = useEditorStore((state) => state.addBlankPage)
  const movePage = useEditorStore((state) => state.movePage)
  const pages = document?.pages ?? []

  function handlePageDragEnd(event: DragEndEvent) {
    const { source } = event.operation
    if (
      event.canceled ||
      !isSortable(source) ||
      source.initialIndex === source.index
    ) {
      return
    }

    const target = pages[source.index]
    if (target) movePage(String(source.id), target.id)
  }

  return (
    <aside
      className={cn(
        "flex h-full min-w-0 flex-col",
        mobile ? "bg-popover" : "bg-sidebar"
      )}
    >
      {!mobile && (
        <div className="panel-heading">
          <span>Pages</span>
          <span className="text-muted-foreground">
            {document?.pages.length ?? 0}
          </span>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <DragDropProvider
          sensors={SORTABLE_SENSORS}
          onDragEnd={handlePageDragEnd}
        >
          <div
            className={cn(
              "flex flex-col",
              mobile ? "gap-0" : "gap-2 p-3"
            )}
          >
            {pages.map((page, index) => (
              <SortablePage
                key={page.id}
                page={page}
                index={index}
                selected={selectedPageId === page.id}
                onDelete={onDelete}
                onSelect={onSelect}
                mobile={mobile}
              />
            ))}
          </div>
        </DragDropProvider>
      </ScrollArea>
      {!mobile && (
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full" onClick={addBlankPage}>
            <PlusIcon data-icon="inline-start" />
            Add page
          </Button>
        </div>
      )}
    </aside>
  )
}

function LayerTypeIcon({ layer }: { layer: EditorLayer }) {
  if (layer.type === "image") return <FileImageIcon className="size-4" />
  if (layer.type === "text") return <TextCursorInputIcon className="size-4" />
  if (layer.type === "brush") return <BrushIcon className="size-4" />
  const Icon =
    layer.shape === "rectangle"
      ? SquareIcon
      : layer.shape === "ellipse"
        ? CircleIcon
        : layer.shape === "line"
          ? MinusIcon
          : layer.shape === "arrow"
            ? MoveUpRightIcon
            : PentagonIcon
  return <Icon className="size-4" />
}

function LayerRow({
  page,
  layer,
  index,
  mobile = false,
}: {
  page: EditorPage
  layer: EditorLayer
  index: number
  mobile?: boolean
}) {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const deleteLayer = useEditorStore((state) => state.deleteLayer)
  const renamingLayerId = useEditorStore((state) => state.renamingLayerId)
  const setRenamingLayer = useEditorStore((state) => state.setRenamingLayer)
  const [nameDraft, setNameDraft] = useState(layer.name)
  const cancelRenameRef = useRef(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const selected = selectedLayerId === layer.id
  const renaming = renamingLayerId === layer.id
  const { ref, handleRef, isDragSource } = useSortable({
    id: layer.id,
    index,
    group: page.id,
    type: "layer",
    disabled: { draggable: layer.locked || renaming },
    transition: SORTABLE_TRANSITION,
  })

  useEffect(() => {
    if (!renaming) return

    const animationFrame = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [renaming])

  const startRenaming = () => {
    selectLayer(layer.id)
    cancelRenameRef.current = false
    setNameDraft(layer.name)
    setRenamingLayer(layer.id)
  }

  const finishRenaming = () => {
    const cancelled = cancelRenameRef.current
    cancelRenameRef.current = false
    setRenamingLayer(null)

    if (cancelled) return

    const name = nameDraft.trim()
    if (name && name !== layer.name) {
      updateLayer(page.id, layer.id, { name })
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        ref={ref}
        className={cn(
          "sortable-item group flex items-center gap-1 px-2 text-sm",
          mobile ? "h-11" : "h-9",
          selected && "bg-accent text-accent-foreground",
          isDragSource && "opacity-70"
        )}
        onContextMenu={() => selectLayer(layer.id)}
      >
        {renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <GripVerticalIcon
              className={cn(
                "size-3",
                selected ? "text-accent-foreground" : "text-muted-foreground"
              )}
            />
            <LayerTypeIcon layer={layer} />
            <Input
              ref={renameInputRef}
              value={nameDraft}
              aria-label="Layer name"
              className="h-7 min-w-0 flex-1 bg-secondary text-secondary-foreground"
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={finishRenaming}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  event.currentTarget.blur()
                }

                if (event.key === "Escape") {
                  event.preventDefault()
                  cancelRenameRef.current = true
                  event.currentTarget.blur()
                }
              }}
            />
          </div>
        ) : (
          <button
            ref={handleRef}
            type="button"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mobile ? "touch-pan-y" : "touch-none",
              layer.locked
                ? "cursor-default"
                : "cursor-grab active:cursor-grabbing"
            )}
            onClick={() => selectLayer(layer.id)}
            onDoubleClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              startRenaming()
            }}
          >
            <GripVerticalIcon
              className={cn(
                "size-3",
                selected ? "text-accent-foreground" : "text-muted-foreground"
              )}
            />
            <LayerTypeIcon layer={layer} />
            <span className="truncate">{layer.name}</span>
          </button>
        )}
        <IconButton
          label={layer.visible ? "Hide layer" : "Show layer"}
          className={cn(mobile && "size-11")}
          onClick={() =>
            updateLayer(page.id, layer.id, { visible: !layer.visible })
          }
        >
          {layer.visible ? <EyeIcon /> : <EyeOffIcon />}
        </IconButton>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem onClick={startRenaming}>
            <PencilIcon /> Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => duplicateLayer(page.id, layer.id)}
          >
            <CopyIcon /> Duplicate
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem
            variant="destructive"
            onClick={() => deleteLayer(page.id, layer.id)}
          >
            <Trash2Icon /> Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function LayerProperties({ page, layer }: { page: EditorPage; layer: EditorLayer }) {
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const setBrushColor = useEditorStore((state) => state.setBrushColor)
  const setBrushWidth = useEditorStore((state) => state.setBrushWidth)
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
  const colorGestureActiveRef = useRef(false)
  const shapeFillEnabled =
    layer.type === "shape" && isShapeFillEnabled(layer)
  const shapeStrokeEnabled =
    layer.type === "shape" && isShapeStrokeEnabled(layer)

  useEffect(
    () => () => {
      if (colorGestureActiveRef.current) {
        useEditorStore.temporal.getState().resume()
      }
    },
    []
  )

  const updateColor = (
    property: "fill" | "stroke" | "color",
    value: string
  ) => {
    if (property === "fill") {
      updateLayer(page.id, layer.id, { fill: value })
      if (layer.type === "shape") setShapeFill(value)
    }
    else if (property === "stroke") {
      updateLayer(page.id, layer.id, { stroke: value })
      if (layer.type === "shape") setShapeStroke(value)
    } else {
      updateLayer(page.id, layer.id, { color: value })
      setBrushColor(value)
    }

    if (!colorGestureActiveRef.current) {
      colorGestureActiveRef.current = true
      useEditorStore.temporal.getState().pause()
    }
  }

  const finishColorGesture = () => {
    if (!colorGestureActiveRef.current) return
    colorGestureActiveRef.current = false
    useEditorStore.temporal.getState().resume()
  }

  return (
    <div className="p-3">
      <FieldGroup className="gap-4">
        {layer.type === "text" && (
          <>
            <Field>
              <FieldLabel htmlFor="text-value">Text</FieldLabel>
              <Input
                id="text-value"
                value={layer.value}
                onChange={(event) =>
                  updateLayer(page.id, layer.id, { value: event.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <Field>
                <FieldLabel>Font</FieldLabel>
                <Select
                  value={layer.fontFamily}
                  onValueChange={(value) =>
                    value &&
                    updateLayer(page.id, layer.id, {
                      fontFamily: value as TextLayer["fontFamily"],
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="Manrope Variable">Manrope</SelectItem>
                      <SelectItem value="Source Serif 4 Variable">
                        Source Serif 4
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="font-size">Size</FieldLabel>
                <Input
                  id="font-size"
                  type="number"
                  min={6}
                  max={240}
                  value={layer.fontSize}
                  onChange={(event) =>
                    updateLayer(page.id, layer.id, {
                      fontSize: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Resize</FieldLabel>
              <ToggleGroup
                className="w-full"
                variant="outline"
                spacing={0}
                value={[getTextResizeMode(layer)]}
                onValueChange={(value) => {
                  const resizeMode = value[0] as TextResizeMode | undefined
                  if (resizeMode) {
                    updateLayer(page.id, layer.id, { resizeMode })
                  }
                }}
                aria-label="Text resize mode"
              >
                <ToggleGroupItem
                  className="flex-1"
                  value="auto-width"
                  aria-label="Auto width"
                >
                  Width
                </ToggleGroupItem>
                <ToggleGroupItem
                  className="flex-1"
                  value="auto-height"
                  aria-label="Auto height"
                >
                  Height
                </ToggleGroupItem>
                <ToggleGroupItem
                  className="flex-1"
                  value="fixed"
                  aria-label="Fixed size"
                >
                  Fixed
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field>
                <FieldLabel>Align</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  spacing={0}
                  value={[layer.align]}
                  onValueChange={(value) => {
                    const align = value[0] as TextLayer["align"] | undefined
                    if (align) updateLayer(page.id, layer.id, { align })
                  }}
                  aria-label="Text alignment"
                >
                  {(
                    [
                      ["left", AlignLeftIcon],
                      ["center", AlignCenterIcon],
                      ["right", AlignRightIcon],
                    ] as const
                  ).map(([align, Icon]) => (
                    <ToggleGroupItem
                      key={align}
                      value={align}
                      aria-label={`Align ${align}`}
                    >
                      <Icon />
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="text-color">Color</FieldLabel>
                <ColorPicker
                  id="text-color"
                  value={layer.fill}
                  label="Text color"
                  onValueChange={(value) => updateColor("fill", value)}
                  onValueChangeEnd={finishColorGesture}
                />
              </Field>
            </div>
          </>
        )}

        {layer.type === "shape" && (
          <>
            {layer.shape !== "line" && layer.shape !== "arrow" && (
              <>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="shape-fill-enabled">Fill</FieldLabel>
                  <Switch
                    id="shape-fill-enabled"
                    checked={shapeFillEnabled}
                    onCheckedChange={(checked) => {
                      updateLayer(page.id, layer.id, {
                        fill: layer.fill ?? "#FFFFFF",
                        fillEnabled: checked,
                      })
                      setShapeFillEnabled(checked)
                    }}
                    aria-label="Enable fill"
                  />
                </Field>
                <Field
                  orientation="horizontal"
                  data-disabled={!shapeFillEnabled}
                >
                  <FieldLabel htmlFor="shape-fill-color">Fill color</FieldLabel>
                  <ColorPicker
                    id="shape-fill-color"
                    value={layer.fill ?? "#FFFFFF"}
                    label="Fill color"
                    disabled={!shapeFillEnabled}
                    onValueChange={(value) => updateColor("fill", value)}
                    onValueChangeEnd={finishColorGesture}
                  />
                </Field>
              </>
            )}
            <Field orientation="horizontal">
              <FieldLabel htmlFor="shape-stroke-enabled">Stroke</FieldLabel>
              <Switch
                id="shape-stroke-enabled"
                checked={shapeStrokeEnabled}
                onCheckedChange={(checked) => {
                  updateLayer(page.id, layer.id, {
                    stroke: layer.stroke ?? "#26241F",
                    strokeEnabled: checked,
                  })
                  setShapeStrokeEnabled(checked)
                }}
                aria-label="Enable stroke"
              />
            </Field>
            <Field
              orientation="horizontal"
              data-disabled={!shapeStrokeEnabled}
            >
              <FieldLabel htmlFor="shape-stroke-color">Stroke color</FieldLabel>
              <ColorPicker
                id="shape-stroke-color"
                value={layer.stroke ?? "#26241F"}
                label="Stroke color"
                disabled={!shapeStrokeEnabled}
                onValueChange={(value) => updateColor("stroke", value)}
                onValueChangeEnd={finishColorGesture}
              />
            </Field>
            <Field data-disabled={!shapeStrokeEnabled}>
              <FieldLabel htmlFor="shape-stroke-width">Stroke width</FieldLabel>
              <Input
                id="shape-stroke-width"
                type="number"
                min={0.25}
                max={72}
                step={0.25}
                value={layer.strokeWidth}
                disabled={!shapeStrokeEnabled}
                onChange={(event) => {
                  const strokeWidth = Math.min(
                    72,
                    Math.max(0.25, Number(event.target.value))
                  )
                  updateLayer(page.id, layer.id, { strokeWidth })
                  setShapeStrokeWidth(strokeWidth)
                }}
              />
            </Field>
          </>
        )}

        {layer.type === "brush" && (
          <>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="brush-color">Color</FieldLabel>
              <ColorPicker
                id="brush-color"
                value={layer.color}
                label="Brush color"
                onValueChange={(value) => updateColor("color", value)}
                onValueChangeEnd={finishColorGesture}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="brush-width">Size</FieldLabel>
              <Input
                id="brush-width"
                type="number"
                min={0.5}
                max={144}
                step={0.5}
                value={layer.strokeWidth}
                onChange={(event) => {
                  const strokeWidth = Math.min(
                    144,
                    Math.max(0.5, Number(event.target.value))
                  )
                  updateLayer(page.id, layer.id, { strokeWidth })
                  setBrushWidth(strokeWidth)
                }}
              />
            </Field>
          </>
        )}

        <Field>
          <FieldLabel>Opacity {Math.round(layer.opacity * 100)}%</FieldLabel>
          <Slider
            min={10}
            max={100}
            value={Math.round(layer.opacity * 100)}
            onValueChange={(value) =>
              updateLayer(page.id, layer.id, {
                opacity: Number(value) / 100,
              })
            }
          />
        </Field>
      </FieldGroup>
    </div>
  )
}

function LayerList({
  page,
  mobile = false,
}: {
  page: EditorPage | null
  mobile?: boolean
}) {
  const moveLayer = useEditorStore((state) => state.moveLayer)
  const layers = page ? [...page.layers].reverse() : []

  function handleLayerDragEnd(event: DragEndEvent) {
    const { source } = event.operation
    if (
      !page ||
      event.canceled ||
      !isSortable(source) ||
      source.initialIndex === source.index
    ) {
      return
    }

    const target = layers[source.index]
    if (target) moveLayer(page.id, String(source.id), target.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!mobile && (
        <div className="panel-heading">
          <span>Layers</span>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {!page ? null : page.layers.length === 0 ? (
          <Empty className="h-full rounded-none border-0">
            <EmptyMedia>
              <Layers3Icon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No layers</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="h-full">
            <DragDropProvider
              sensors={SORTABLE_SENSORS}
              onDragEnd={handleLayerDragEnd}
            >
              <div className="flex flex-col">
                {layers.map((layer, index) => (
                  <LayerRow
                    key={layer.id}
                    page={page}
                    layer={layer}
                    index={index}
                    mobile={mobile}
                  />
                ))}
              </div>
            </DragDropProvider>
            <div className="flex h-9 items-center gap-2 px-3 text-sm text-muted-foreground">
              <LockIcon className="size-3.5" /> Background
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}

function LayersPanel({ page }: { page: EditorPage | null }) {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectedLayer = page?.layers.find(
    (layer) => layer.id === selectedLayerId
  )

  return (
    <aside className="flex h-full min-w-0 flex-col bg-sidebar">
      <ResizablePanelGroup orientation="vertical">
        <ResizablePanel
          id="layer-properties"
          defaultSize="48%"
          minSize={160}
        >
          <div className="h-full overflow-y-auto">
            {page && selectedLayer && (
              <LayerProperties page={page} layer={selectedLayer} />
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle
          className="cursor-row-resize"
          aria-label="Resize properties and layers"
        />
        <ResizablePanel id="layer-list" minSize={96}>
          <LayerList page={page} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </aside>
  )
}

function Workspace({
  page,
  onEditLayer,
  showCanvasControls = true,
}: {
  page: EditorPage | null
  onEditLayer?: (layerId: string) => void
  showCanvasControls?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 900, height: 700 })

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <main ref={containerRef} className="workspace-grid relative h-full overflow-hidden">
      {page ? (
        <PageCanvas
          page={page}
          width={size.width}
          height={size.height}
          onEditLayer={onEditLayer}
          showControls={showCanvasControls}
        />
      ) : (
        <Empty className="h-full rounded-none border-0">
          <EmptyMedia className="text-foreground [&_svg]:size-12">
            <ScanLineIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Open a PDF or add a blank page</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </main>
  )
}

function MobileDrawer({
  open,
  onOpenChange,
  title,
  side,
  actions,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  side: "left" | "right"
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "mobile-drawer",
          side === "left" ? "mobile-drawer-left" : "mobile-drawer-right"
        )}
      >
        <DialogHeader className="mobile-drawer-header">
          <DialogTitle>{title}</DialogTitle>
          <div className="ml-auto flex items-center gap-1">
            {actions}
            <DialogClose
              render={
                <Button variant="ghost" size="icon-lg" aria-label="Close" />
              }
            >
              <XIcon />
            </DialogClose>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

function MobileAction({
  icon: Icon,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  icon: LucideIcon
}) {
  return (
    <Button
      variant="ghost"
      className="mobile-command-action h-12 w-full justify-start px-4"
      {...props}
    >
      <Icon data-icon="inline-start" />
      {children}
    </Button>
  )
}

function MobileActionGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-4 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  )
}

export default function Editor() {
  const narrowLayout = useNarrowLayout()
  const persistence = useEditorPersistence()
  const document = useEditorStore((state) => state.document)
  const selectedPageId = useEditorStore((state) => state.selectedPageId)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const drawingTool = useEditorStore((state) => state.drawingTool)
  const drawingGestureActive = useEditorStore(
    (state) => state.drawingGestureActive
  )
  const setDocument = useEditorStore((state) => state.setDocument)
  const selectPage = useEditorStore((state) => state.selectPage)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const setRenamingLayer = useEditorStore((state) => state.setRenamingLayer)
  const appendPages = useEditorStore((state) => state.appendPages)
  const addBlankPage = useEditorStore((state) => state.addBlankPage)
  const addLayer = useEditorStore((state) => state.addLayer)
  const setDrawingTool = useEditorStore((state) => state.setDrawingTool)
  const setShapeKind = useEditorStore((state) => state.setShapeKind)
  const deletePage = useEditorStore((state) => state.deletePage)
  const duplicatePage = useEditorStore((state) => state.duplicatePage)
  const rotatePage = useEditorStore((state) => state.rotatePage)
  const movePage = useEditorStore((state) => state.movePage)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const deleteLayer = useEditorStore((state) => state.deleteLayer)
  const moveLayer = useEditorStore((state) => state.moveLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const brushWidth = useEditorStore((state) => state.brushWidth)
  const setBrushWidth = useEditorStore((state) => state.setBrushWidth)
  const shapeFill = useEditorStore((state) => state.shapeFill)
  const shapeStroke = useEditorStore((state) => state.shapeStroke)
  const setShapeFill = useEditorStore((state) => state.setShapeFill)
  const setShapeStroke = useEditorStore((state) => state.setShapeStroke)
  const selectedPage =
    document?.pages.find((page) => page.id === selectedPageId) ?? null
  const selectedLayer =
    selectedPage?.layers.find((layer) => layer.id === selectedLayerId) ?? null
  const hasSelectedLayer = Boolean(selectedLayer)
  const undo = useStore(useEditorStore.temporal, (state) => state.undo)
  const redo = useStore(useEditorStore.temporal, (state) => state.redo)
  const canUndo = useStore(
    useEditorStore.temporal,
    (state) => state.pastStates.length > 0
  )
  const canRedo = useStore(
    useEditorStore.temporal,
    (state) => state.futureStates.length > 0
  )
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const appendInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const layerClipboardRef = useRef<EditorLayer | null>(null)
  const [busy, setBusy] = useState(false)
  const [hasLayerClipboard, setHasLayerClipboard] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletePageId, setDeletePageId] = useState<string | null>(null)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [mobileDrawer, setMobileDrawer] = useState<MobileDrawerName | null>(null)
  const [mobileInspectorView, setMobileInspectorView] =
    useState<MobileInspectorView>("layers")
  const [exportState, setExportState] = useState<{
    current: number
    total: number
  } | null>(null)

  const restoring = persistence.status === "loading"
  const commandShortcutsEnabled =
    !restoring && !exportDialogOpen && !deletePageId

  function copySelectedLayer(cut = false) {
    if (!selectedPage || !selectedLayer) return
    layerClipboardRef.current = cloneLayerForClipboard(selectedLayer)
    setHasLayerClipboard(true)
    if (cut) deleteLayer(selectedPage.id, selectedLayer.id)
  }

  function pasteLayer() {
    if (!selectedPage || !layerClipboardRef.current) return
    const source = layerClipboardRef.current
    addLayer(selectedPage.id, {
      ...cloneLayerForClipboard(source),
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
      x: source.x + 12,
      y: source.y + 12,
    })
  }

  function selectAdjacentLayer(direction: -1 | 1) {
    if (!selectedPage?.layers.length) return
    const currentIndex = selectedLayerId
      ? selectedPage.layers.findIndex((layer) => layer.id === selectedLayerId)
      : direction > 0
        ? -1
        : selectedPage.layers.length
    const nextIndex = Math.min(
      selectedPage.layers.length - 1,
      Math.max(0, currentIndex + direction)
    )
    selectLayer(selectedPage.layers[nextIndex]?.id ?? null)
  }

  function moveSelectedLayer(direction: -1 | 1 | "front" | "back") {
    if (!selectedPage || !selectedLayer || selectedLayer.locked) return
    const layers = selectedPage.layers
    const currentIndex = layers.findIndex((layer) => layer.id === selectedLayer.id)
    const targetIndex =
      direction === "front"
        ? layers.length - 1
        : direction === "back"
          ? 0
          : Math.min(layers.length - 1, Math.max(0, currentIndex + direction))
    const target = layers[targetIndex]
    if (target && target.id !== selectedLayer.id) {
      moveLayer(selectedPage.id, selectedLayer.id, target.id)
    }
  }

  function selectAdjacentPage(direction: -1 | 1) {
    if (!document?.pages.length || !selectedPageId) return
    const currentIndex = document.pages.findIndex(
      (page) => page.id === selectedPageId
    )
    const nextIndex = Math.min(
      document.pages.length - 1,
      Math.max(0, currentIndex + direction)
    )
    const nextPage = document.pages[nextIndex]
    if (nextPage && nextPage.id !== selectedPageId) selectPage(nextPage.id)
  }

  function moveSelectedPage(direction: -1 | 1) {
    if (!document?.pages.length || !selectedPageId) return
    const currentIndex = document.pages.findIndex(
      (page) => page.id === selectedPageId
    )
    const targetIndex = Math.min(
      document.pages.length - 1,
      Math.max(0, currentIndex + direction)
    )
    const target = document.pages[targetIndex]
    if (target && target.id !== selectedPageId) {
      movePage(selectedPageId, target.id)
    }
  }

  function changeBrushSize(direction: -1 | 1) {
    const step = brushWidth < 10 ? 1 : 5
    setBrushWidth(brushWidth + direction * step)
  }

  function updateShapePaint(mode: "swap" | "reset") {
    const fill = mode === "swap" ? shapeStroke : "#FFFFFF"
    const stroke = mode === "swap" ? shapeFill : "#26241F"
    setShapeFill(fill)
    setShapeStroke(stroke)
    if (selectedPage && selectedLayer?.type === "shape") {
      updateLayer(selectedPage.id, selectedLayer.id, { fill, stroke })
    }
  }

  useHotkeys(
    [
      {
        hotkey: EDITOR_SHORTCUTS.openPdf,
        callback: () => pdfInputRef.current?.click(),
        options: { enabled: commandShortcutsEnabled && !busy },
      },
      {
        hotkey: EDITOR_SHORTCUTS.appendPdf,
        callback: () => appendInputRef.current?.click(),
        options: {
          enabled: commandShortcutsEnabled && !busy && Boolean(document),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.exportPdf,
        callback: () => setExportDialogOpen(true),
        options: {
          enabled:
            commandShortcutsEnabled &&
            Boolean(document?.pages.length) &&
            !exportState,
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.undo,
        callback: () => undo(),
        options: { enabled: commandShortcutsEnabled && canUndo },
      },
      {
        hotkey: EDITOR_SHORTCUTS.redo,
        callback: () => redo(),
        options: { enabled: commandShortcutsEnabled && canRedo },
      },
      {
        hotkey: EDITOR_SHORTCUTS.saveDocument,
        callback: () => void persistence.saveDocument(),
        options: { enabled: commandShortcutsEnabled && Boolean(document) },
      },
      ...[
        EDITOR_SHORTCUTS.deleteLayer,
        EDITOR_SHORTCUTS.deleteLayerForward,
      ].map((hotkey) => ({
        hotkey,
        callback: () => {
          if (selectedPage && selectedLayer) {
            deleteLayer(selectedPage.id, selectedLayer.id)
          }
        },
        options: {
          enabled:
            commandShortcutsEnabled && !drawingGestureActive && hasSelectedLayer,
        },
      })),
      ...[
        EDITOR_SHORTCUTS.deletePage,
        EDITOR_SHORTCUTS.deletePageForward,
      ].map((hotkey) => ({
        hotkey,
        callback: () => selectedPageId && setDeletePageId(selectedPageId),
        options: {
          enabled:
            commandShortcutsEnabled &&
            !drawingGestureActive &&
            Boolean(selectedPageId),
        },
      })),
      {
        hotkey: EDITOR_SHORTCUTS.duplicateLayer,
        callback: () => {
          if (selectedPage && selectedLayer) {
            duplicateLayer(selectedPage.id, selectedLayer.id)
          }
        },
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.duplicatePage,
        callback: () => selectedPageId && duplicatePage(selectedPageId),
        options: {
          enabled:
            commandShortcutsEnabled &&
            !drawingGestureActive &&
            Boolean(selectedPageId),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.renameLayer,
        callback: () => selectedLayerId && setRenamingLayer(selectedLayerId),
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.selectLayerAbove,
        callback: () => selectAdjacentLayer(1),
        options: {
          enabled:
            commandShortcutsEnabled && !drawingGestureActive && Boolean(selectedPage),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.selectLayerBelow,
        callback: () => selectAdjacentLayer(-1),
        options: {
          enabled:
            commandShortcutsEnabled && !drawingGestureActive && Boolean(selectedPage),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.moveLayerForward,
        callback: () => moveSelectedLayer(1),
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.moveLayerBackward,
        callback: () => moveSelectedLayer(-1),
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.moveLayerToFront,
        callback: () => moveSelectedLayer("front"),
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.moveLayerToBack,
        callback: () => moveSelectedLayer("back"),
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.toggleLayerVisibility,
        callback: () => {
          if (selectedPage && selectedLayer) {
            updateLayer(selectedPage.id, selectedLayer.id, {
              visible: !selectedLayer.visible,
            })
          }
        },
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.toggleLayerLock,
        callback: () => {
          if (selectedPage && selectedLayer) {
            updateLayer(selectedPage.id, selectedLayer.id, {
              locked: !selectedLayer.locked,
            })
          }
        },
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.copyLayer,
        callback: () => copySelectedLayer(),
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.cutLayer,
        callback: () => copySelectedLayer(true),
        options: { enabled: commandShortcutsEnabled && hasSelectedLayer },
      },
      {
        hotkey: EDITOR_SHORTCUTS.pasteLayer,
        callback: pasteLayer,
        options: {
          enabled:
            commandShortcutsEnabled && hasLayerClipboard && Boolean(selectedPage),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.deselectLayer,
        callback: () => selectLayer(null),
        options: {
          enabled: commandShortcutsEnabled && !drawingTool && hasSelectedLayer,
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.previousPage,
        callback: () => selectAdjacentPage(-1),
        options: {
          enabled:
            commandShortcutsEnabled && !drawingGestureActive && Boolean(selectedPage),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.nextPage,
        callback: () => selectAdjacentPage(1),
        options: {
          enabled:
            commandShortcutsEnabled && !drawingGestureActive && Boolean(selectedPage),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.movePageEarlier,
        callback: () => moveSelectedPage(-1),
        options: {
          enabled:
            commandShortcutsEnabled &&
            !drawingGestureActive &&
            Boolean(selectedPage),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.movePageLater,
        callback: () => moveSelectedPage(1),
        options: {
          enabled:
            commandShortcutsEnabled &&
            !drawingGestureActive &&
            Boolean(selectedPage),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.addBlankPage,
        callback: addBlankPage,
        options: { enabled: commandShortcutsEnabled && !drawingGestureActive },
      },
      {
        hotkey: EDITOR_SHORTCUTS.rotatePage,
        callback: () => selectedPageId && rotatePage(selectedPageId),
        options: {
          enabled:
            commandShortcutsEnabled && !drawingGestureActive && Boolean(selectedPage),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.textTool,
        callback: addText,
        options: { enabled: commandShortcutsEnabled },
      },
      {
        hotkey: EDITOR_SHORTCUTS.decreaseBrushSize,
        callback: () => changeBrushSize(-1),
        options: { enabled: commandShortcutsEnabled && drawingTool === "brush" },
      },
      {
        hotkey: EDITOR_SHORTCUTS.increaseBrushSize,
        callback: () => changeBrushSize(1),
        options: { enabled: commandShortcutsEnabled && drawingTool === "brush" },
      },
      {
        hotkey: EDITOR_SHORTCUTS.swapShapePaint,
        callback: () => updateShapePaint("swap"),
        options: {
          enabled:
            commandShortcutsEnabled &&
            ((drawingTool !== null && drawingTool !== "brush") ||
              selectedLayer?.type === "shape"),
        },
      },
      {
        hotkey: EDITOR_SHORTCUTS.resetShapePaint,
        callback: () => updateShapePaint("reset"),
        options: {
          enabled:
            commandShortcutsEnabled &&
            ((drawingTool !== null && drawingTool !== "brush") ||
              selectedLayer?.type === "shape"),
        },
      },
    ],
    {
      ignoreInputs: true,
      preventDefault: true,
      requireReset: true,
      stopPropagation: true,
    }
  )

  async function openPdf(file: File, append = false) {
    setBusy(true)
    setError(null)
    try {
      const imported = await importPdfFile(file)
      if (append && document) {
        appendPages(imported.pages)
      } else {
        layerClipboardRef.current = null
        setHasLayerClipboard(false)
        const nextDocument = {
          id: crypto.randomUUID(),
          name: imported.name,
          pages: imported.pages,
        }
        setDocument(nextDocument)
        clearEditorHistory()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open PDF.")
    } finally {
      setBusy(false)
    }
  }

  function ensurePage() {
    if (selectedPageId) return selectedPageId
    addBlankPage()
    return useEditorStore.getState().selectedPageId
  }

  function addText() {
    setDrawingTool(null)
    const pageId = ensurePage()
    const page = useEditorStore
      .getState()
      .document?.pages.find((item) => item.id === pageId)
    if (!pageId || !page) return
    addLayer(pageId, {
      id: crypto.randomUUID(),
      type: "text",
      name: "Text",
      value: "Text",
      resizeMode: "auto-height",
      x: page.widthPt * 0.18,
      y: page.heightPt * 0.18,
      width: page.widthPt * 0.44,
      height: 72,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fontFamily: "Manrope Variable",
      fontSize: 28,
      fontWeight: 500,
      fill: "#26241f",
      align: "left",
      lineHeight: 1.2,
    })
  }

  function chooseShapeTool(shape: ShapeKind) {
    ensurePage()
    setShapeKind(shape)
    setDrawingTool(shape)
  }

  function chooseBrushTool() {
    ensurePage()
    setDrawingTool("brush")
  }

  async function addImageFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      const asset = await registerImage(file)
      const pageId = ensurePage()
      const page = useEditorStore
        .getState()
        .document?.pages.find((item) => item.id === pageId)
      if (!pageId || !page) return
      const width = Math.min(page.widthPt * 0.42, 220)
      const height = width * (asset.height / asset.width)
      addLayer(pageId, {
        id: crypto.randomUUID(),
        type: "image",
        name: asset.name.replace(/\.[^.]+$/, ""),
        assetId: asset.id,
        x: (page.widthPt - width) / 2,
        y: (page.heightPt - height) / 2,
        width,
        height,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
      })
    } catch {
      setError("Could not open image.")
    } finally {
      setBusy(false)
    }
  }

  async function runExport(settings: ExportSettings) {
    if (!document || document.pages.length === 0) return
    setError(null)
    setExportState({ current: 0, total: document.pages.length })
    try {
      await window.document.fonts.ready
      await exportDocument(
        document.name,
        document.pages,
        settings,
        (current, total) => setExportState({ current, total })
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.")
    } finally {
      setExportState(null)
    }
  }

  async function closeDocument() {
    setBusy(true)
    try {
      if (await persistence.closeDocument()) {
        layerClipboardRef.current = null
        setHasLayerClipboard(false)
      }
    } finally {
      setBusy(false)
    }
  }

  function handlePdfInput(
    event: ChangeEvent<HTMLInputElement>,
    append = false
  ) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) void openPdf(file, append)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (!file) return
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      void openPdf(file, Boolean(document))
    } else if (file.type.startsWith("image/")) {
      void addImageFile(file)
    }
  }

  return (
    <div
      className="editor-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <header className="mobile-toolbar">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Open application menu"
          onClick={() => setMobileDrawer("menu")}
        >
          <MenuIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={`Pages, ${document?.pages.length ?? 0}`}
          onClick={() => setMobileDrawer("pages")}
        >
          <FilesIcon />
        </Button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-medium">
          {document?.name ?? "Untitled"}
        </span>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Insert"
          onClick={() => setMobileDrawer("insert")}
        >
          <PlusIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Open inspector"
          onClick={() => {
            setMobileInspectorView(selectedLayer ? "properties" : "layers")
            setMobileDrawer("inspector")
          }}
        >
          <SlidersHorizontalIcon />
        </Button>
      </header>

      <header className="toolbar desktop-toolbar">
        <div className="brand mr-3">Scannerize</div>
        <Menubar aria-label="Application menu">
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarGroup>
                <MenubarItem
                  disabled={busy || restoring}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  <FilePlus2Icon /> Open PDF…
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.openPdf)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={busy || restoring || !document}
                  onClick={() => appendInputRef.current?.click()}
                >
                  <PlusIcon /> Append PDF…
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.appendPdf)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={restoring || !document}
                  onClick={() => void persistence.saveDocument()}
                >
                  <SaveIcon /> Save now
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.saveDocument)}
                  </MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem
                  disabled={!document?.pages.length || Boolean(exportState)}
                  onClick={() => setExportDialogOpen(true)}
                >
                  <DownloadIcon /> Export PDF…
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.exportPdf)}
                  </MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem
                  disabled={busy || restoring || Boolean(exportState) || !document}
                  onClick={() => void closeDocument()}
                >
                  <XIcon /> Close document
                </MenubarItem>
              </MenubarGroup>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>Edit</MenubarTrigger>
            <MenubarContent>
              <MenubarGroup>
                <MenubarItem disabled={!canUndo} onClick={() => undo()}>
                  <Undo2Icon /> Undo
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.undo)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem disabled={!canRedo} onClick={() => redo()}>
                  <Redo2Icon /> Redo
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.redo)}
                  </MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem
                  disabled={!hasSelectedLayer}
                  onClick={() => copySelectedLayer(true)}
                >
                  <ScissorsIcon /> Cut layer
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.cutLayer)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!hasSelectedLayer}
                  onClick={() => copySelectedLayer()}
                >
                  <CopyIcon /> Copy layer
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.copyLayer)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!selectedPage || !hasLayerClipboard}
                  onClick={pasteLayer}
                >
                  <ClipboardPasteIcon /> Paste layer
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.pasteLayer)}
                  </MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem
                  disabled={!hasSelectedLayer}
                  onClick={() =>
                    selectedLayerId && setRenamingLayer(selectedLayerId)
                  }
                >
                  <PencilIcon /> Rename layer
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.renameLayer)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!hasSelectedLayer}
                  onClick={() => {
                    if (selectedPage && selectedLayerId) {
                      duplicateLayer(selectedPage.id, selectedLayerId)
                    }
                  }}
                >
                  <CopyIcon /> Duplicate layer
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.duplicateLayer)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  variant="destructive"
                  disabled={!hasSelectedLayer}
                  onClick={() => {
                    if (selectedPage && selectedLayerId) {
                      deleteLayer(selectedPage.id, selectedLayerId)
                    }
                  }}
                >
                  <Trash2Icon /> Delete layer
                  <MenubarShortcut>
                    {formatDeleteShortcut("layer")}
                  </MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarSub>
                  <MenubarSubTrigger disabled={!hasSelectedLayer}>
                    <Layers3Icon /> Layer order
                  </MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarGroup>
                      <MenubarItem onClick={() => selectAdjacentLayer(1)}>
                        <ArrowUpIcon /> Select above
                        <MenubarShortcut>
                          {formatEditorShortcut(
                            EDITOR_SHORTCUTS.selectLayerAbove
                          )}
                        </MenubarShortcut>
                      </MenubarItem>
                      <MenubarItem onClick={() => selectAdjacentLayer(-1)}>
                        <ArrowDownIcon /> Select below
                        <MenubarShortcut>
                          {formatEditorShortcut(
                            EDITOR_SHORTCUTS.selectLayerBelow
                          )}
                        </MenubarShortcut>
                      </MenubarItem>
                      <MenubarItem onClick={() => moveSelectedLayer(1)}>
                        <ArrowUpIcon /> Move forward
                        <MenubarShortcut>
                          {formatEditorShortcut(
                            EDITOR_SHORTCUTS.moveLayerForward
                          )}
                        </MenubarShortcut>
                      </MenubarItem>
                      <MenubarItem onClick={() => moveSelectedLayer(-1)}>
                        <ArrowDownIcon /> Move backward
                        <MenubarShortcut>
                          {formatEditorShortcut(
                            EDITOR_SHORTCUTS.moveLayerBackward
                          )}
                        </MenubarShortcut>
                      </MenubarItem>
                      <MenubarItem onClick={() => moveSelectedLayer("front")}>
                        <ArrowUpIcon /> Bring to front
                        <MenubarShortcut>
                          {formatEditorShortcut(
                            EDITOR_SHORTCUTS.moveLayerToFront
                          )}
                        </MenubarShortcut>
                      </MenubarItem>
                      <MenubarItem onClick={() => moveSelectedLayer("back")}>
                        <ArrowDownIcon /> Send to back
                        <MenubarShortcut>
                          {formatEditorShortcut(
                            EDITOR_SHORTCUTS.moveLayerToBack
                          )}
                        </MenubarShortcut>
                      </MenubarItem>
                    </MenubarGroup>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarItem
                  disabled={!selectedLayer}
                  onClick={() => {
                    if (selectedPage && selectedLayer) {
                      updateLayer(selectedPage.id, selectedLayer.id, {
                        visible: !selectedLayer.visible,
                      })
                    }
                  }}
                >
                  <EyeIcon /> Toggle visibility
                  <MenubarShortcut>
                    {formatEditorShortcut(
                      EDITOR_SHORTCUTS.toggleLayerVisibility
                    )}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!selectedLayer}
                  onClick={() => {
                    if (selectedPage && selectedLayer) {
                      updateLayer(selectedPage.id, selectedLayer.id, {
                        locked: !selectedLayer.locked,
                      })
                    }
                  }}
                >
                  <LockIcon /> Toggle lock
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.toggleLayerLock)}
                  </MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>Insert</MenubarTrigger>
            <MenubarContent>
              <MenubarGroup>
                <MenubarItem
                  disabled={busy || restoring}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImagePlusIcon /> Image…
                </MenubarItem>
                <MenubarItem disabled={restoring} onClick={addText}>
                  <TextCursorInputIcon /> Text
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.textTool)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem disabled={restoring} onClick={chooseBrushTool}>
                  <BrushIcon /> Brush
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.brushTool)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarSub>
                  <MenubarSubTrigger disabled={restoring}>
                    <SquareIcon /> Shape
                    <MenubarShortcut>
                      {formatEditorShortcut(EDITOR_SHORTCUTS.shapeTool)}
                    </MenubarShortcut>
                  </MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarGroup>
                      {SHAPE_INSERT_ACTIONS.map(
                        ({ value, label, icon: Icon }) => (
                          <MenubarItem
                            key={value}
                            onClick={() => chooseShapeTool(value)}
                          >
                            <Icon /> {label}
                          </MenubarItem>
                        )
                      )}
                    </MenubarGroup>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem disabled={restoring} onClick={addBlankPage}>
                  <PlusIcon /> Blank page
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.addBlankPage)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={busy || restoring}
                  onClick={() => appendInputRef.current?.click()}
                >
                  <FilePlus2Icon /> PDF pages…
                </MenubarItem>
              </MenubarGroup>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger>Page</MenubarTrigger>
            <MenubarContent>
              <MenubarGroup>
                <MenubarItem
                  disabled={!selectedPageId}
                  onClick={() => {
                    if (selectedPageId) duplicatePage(selectedPageId)
                  }}
                >
                  <CopyIcon /> Duplicate
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.duplicatePage)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!selectedPageId}
                  onClick={() => {
                    if (selectedPageId) rotatePage(selectedPageId)
                  }}
                >
                  <RotateCwIcon /> Rotate clockwise
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.rotatePage)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!selectedPageId}
                  onClick={() => selectAdjacentPage(-1)}
                >
                  <ArrowUpIcon /> Previous page
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.previousPage)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!selectedPageId}
                  onClick={() => selectAdjacentPage(1)}
                >
                  <ArrowDownIcon /> Next page
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.nextPage)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!selectedPageId}
                  onClick={() => moveSelectedPage(-1)}
                >
                  <ArrowUpIcon /> Move earlier
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.movePageEarlier)}
                  </MenubarShortcut>
                </MenubarItem>
                <MenubarItem
                  disabled={!selectedPageId}
                  onClick={() => moveSelectedPage(1)}
                >
                  <ArrowDownIcon /> Move later
                  <MenubarShortcut>
                    {formatEditorShortcut(EDITOR_SHORTCUTS.movePageLater)}
                  </MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem
                  variant="destructive"
                  disabled={!selectedPageId}
                  onClick={() => {
                    if (selectedPageId) setDeletePageId(selectedPageId)
                  }}
                >
                  <Trash2Icon /> Delete
                  <MenubarShortcut>
                    {formatDeleteShortcut("page")}
                  </MenubarShortcut>
                </MenubarItem>
              </MenubarGroup>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>

        <span className="pointer-events-none absolute left-1/2 max-w-72 -translate-x-1/2 truncate text-sm font-medium">
          {document?.name ?? "Untitled"}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {persistence.status !== "idle" && (
            <span
              className={cn(
                "px-1 text-xs text-muted-foreground",
                (persistence.status === "error" ||
                  persistence.status === "conflict") &&
                  "text-destructive"
              )}
              aria-live="polite"
            >
              {persistence.status === "loading"
                ? "Restoring…"
                : persistence.status === "saving"
                  ? "Saving…"
                  : persistence.status === "error"
                    ? "Not saved"
                    : persistence.status === "conflict"
                      ? "Open elsewhere"
                    : "Saved"}
            </span>
          )}
          {(error || persistence.error) && (
            <span className="max-w-64 truncate text-xs text-destructive" role="alert">
              {error || persistence.error}
            </span>
          )}
          {exportState && (
            <div className="flex w-32 items-center gap-2" aria-live="polite">
              <Progress
                value={
                  exportState.total
                    ? (exportState.current / exportState.total) * 100
                    : 0
                }
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">
                {exportState.current}/{exportState.total}
              </span>
            </div>
          )}
          <IconButton
            label="Undo"
            disabled={!canUndo}
            onClick={() => undo()}
          >
            <Undo2Icon />
          </IconButton>
          <IconButton
            label="Redo"
            disabled={!canRedo}
            onClick={() => redo()}
          >
            <Redo2Icon />
          </IconButton>
          <ExportDialog
            document={document}
            selectedPageId={selectedPageId}
            disabled={!document?.pages.length || Boolean(exportState)}
            open={exportDialogOpen}
            onOpenChange={setExportDialogOpen}
            onExport={(settings) => void runExport(settings)}
          />
        </div>
      </header>

      {narrowLayout ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {(error ||
            persistence.error ||
            persistence.status === "conflict" ||
            exportState) && (
            <div
              className="flex h-7 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 text-xs"
              aria-live="polite"
              role={error || persistence.error ? "alert" : "status"}
            >
              {exportState ? (
                <>
                  <Progress
                    value={
                      exportState.total
                        ? (exportState.current / exportState.total) * 100
                        : 0
                    }
                    className="flex-1"
                  />
                  <span className="text-muted-foreground">
                    {exportState.current}/{exportState.total}
                  </span>
                </>
              ) : (
                <span className="truncate text-destructive">
                  {error || persistence.error || "This document is open elsewhere."}
                </span>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1">
            <Workspace
              page={selectedPage}
              showCanvasControls={false}
              onEditLayer={() => {
                setMobileInspectorView("properties")
                setMobileDrawer("inspector")
              }}
            />
          </div>
        </div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="pages" defaultSize={190} minSize={150} maxSize={280}>
            <PageRail onDelete={setDeletePageId} />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="workspace" minSize={420}>
            <Workspace page={selectedPage} />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="layers" defaultSize={278} minSize={230} maxSize={360}>
            <LayersPanel page={selectedPage} />
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <MobileDrawer
        side="left"
        open={narrowLayout && mobileDrawer === "pages"}
        onOpenChange={(open) => setMobileDrawer(open ? "pages" : null)}
        title={`Pages · ${document?.pages.length ?? 0}`}
        actions={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Add blank page"
            onClick={addBlankPage}
          >
            <PlusIcon />
          </Button>
        }
      >
        <PageRail
          mobile
          onSelect={() => setMobileDrawer(null)}
          onDelete={(pageId) => {
            setMobileDrawer(null)
            setDeletePageId(pageId)
          }}
        />
      </MobileDrawer>

      <MobileDrawer
        side="right"
        open={narrowLayout && mobileDrawer === "inspector"}
        onOpenChange={(open) => setMobileDrawer(open ? "inspector" : null)}
        title="Inspector"
      >
        <div className="flex h-full min-h-0 flex-col">
          <ToggleGroup
            className="m-2 grid grid-cols-2"
            variant="outline"
            spacing={0}
            value={[mobileInspectorView]}
            onValueChange={(value) => {
              const nextView = value[0] as MobileInspectorView | undefined
              if (nextView) setMobileInspectorView(nextView)
            }}
            aria-label="Inspector view"
          >
            <ToggleGroupItem value="layers">Layers</ToggleGroupItem>
            <ToggleGroupItem value="properties" disabled={!selectedLayer}>
              Properties
            </ToggleGroupItem>
          </ToggleGroup>
          <Separator />
          <div className="min-h-0 flex-1">
            {mobileInspectorView === "layers" ? (
              <LayerList mobile page={selectedPage} />
            ) : (
              <ScrollArea className="h-full">
                {selectedPage && selectedLayer && (
                  <LayerProperties page={selectedPage} layer={selectedLayer} />
                )}
              </ScrollArea>
            )}
          </div>
        </div>
      </MobileDrawer>

      <MobileDrawer
        side="right"
        open={narrowLayout && mobileDrawer === "insert"}
        onOpenChange={(open) => setMobileDrawer(open ? "insert" : null)}
        title="Insert"
      >
        <div className="flex flex-col gap-4 py-3">
          <MobileActionGroup label="Draw">
            <MobileAction
              icon={BrushIcon}
              disabled={restoring}
              onClick={() => {
                setMobileDrawer(null)
                chooseBrushTool()
              }}
            >
              Brush
            </MobileAction>
            {SHAPE_INSERT_ACTIONS.map(({ value, label, icon }) => (
              <MobileAction
                key={value}
                icon={icon}
                disabled={restoring}
                onClick={() => {
                  setMobileDrawer(null)
                  chooseShapeTool(value)
                }}
              >
                {label}
              </MobileAction>
            ))}
          </MobileActionGroup>
          <Separator />
          <MobileActionGroup label="Content">
          <MobileAction
            icon={ImagePlusIcon}
            disabled={busy || restoring}
            onClick={() => {
              setMobileDrawer(null)
              imageInputRef.current?.click()
            }}
          >
            Image…
          </MobileAction>
          <MobileAction
            icon={TextCursorInputIcon}
            disabled={restoring}
            onClick={() => {
              setMobileDrawer(null)
              addText()
            }}
          >
            Text
          </MobileAction>
          <MobileAction
            icon={PlusIcon}
            disabled={restoring}
            onClick={() => {
              setMobileDrawer(null)
              addBlankPage()
            }}
          >
            Blank page
          </MobileAction>
          <MobileAction
            icon={FilePlus2Icon}
            disabled={busy || restoring}
            onClick={() => {
              setMobileDrawer(null)
              appendInputRef.current?.click()
            }}
          >
            PDF pages…
          </MobileAction>
          </MobileActionGroup>
        </div>
      </MobileDrawer>

      <MobileDrawer
        side="left"
        open={narrowLayout && mobileDrawer === "menu"}
        onOpenChange={(open) => setMobileDrawer(open ? "menu" : null)}
        title="Scannerize"
      >
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 py-3 pb-6">
            <MobileActionGroup label="File">
              <MobileAction
                icon={FilePlus2Icon}
                disabled={busy || restoring}
                onClick={() => {
                  setMobileDrawer(null)
                  pdfInputRef.current?.click()
                }}
              >
                Open PDF…
              </MobileAction>
              <MobileAction
                icon={PlusIcon}
                disabled={busy || restoring || !document}
                onClick={() => {
                  setMobileDrawer(null)
                  appendInputRef.current?.click()
                }}
              >
                Append PDF…
              </MobileAction>
              <MobileAction
                icon={DownloadIcon}
                disabled={!document?.pages.length || Boolean(exportState)}
                onClick={() => {
                  setMobileDrawer(null)
                  setExportDialogOpen(true)
                }}
              >
                Export PDF…
              </MobileAction>
              <MobileAction
                icon={XIcon}
                disabled={busy || restoring || Boolean(exportState) || !document}
                onClick={() => {
                  setMobileDrawer(null)
                  void closeDocument()
                }}
              >
                Close document
              </MobileAction>
            </MobileActionGroup>

            <Separator />

            <MobileActionGroup label="Edit">
              <MobileAction icon={Undo2Icon} disabled={!canUndo} onClick={() => undo()}>
                Undo
              </MobileAction>
              <MobileAction icon={Redo2Icon} disabled={!canRedo} onClick={() => redo()}>
                Redo
              </MobileAction>
              <MobileAction
                icon={CopyIcon}
                disabled={!hasSelectedLayer}
                onClick={() => {
                  if (selectedPage && selectedLayerId) {
                    duplicateLayer(selectedPage.id, selectedLayerId)
                  }
                }}
              >
                Duplicate layer
              </MobileAction>
              <MobileAction
                icon={Trash2Icon}
                variant="destructive"
                disabled={!hasSelectedLayer}
                onClick={() => {
                  if (selectedPage && selectedLayerId) {
                    deleteLayer(selectedPage.id, selectedLayerId)
                  }
                }}
              >
                Delete layer
              </MobileAction>
            </MobileActionGroup>

            <Separator />

            <MobileActionGroup label="Insert">
              <MobileAction
                icon={BrushIcon}
                disabled={restoring}
                onClick={() => setMobileDrawer("insert")}
              >
                Draw
              </MobileAction>
              <MobileAction
                icon={ImagePlusIcon}
                disabled={busy || restoring}
                onClick={() => {
                  setMobileDrawer(null)
                  imageInputRef.current?.click()
                }}
              >
                Image…
              </MobileAction>
              <MobileAction
                icon={TextCursorInputIcon}
                disabled={restoring}
                onClick={() => {
                  setMobileDrawer(null)
                  addText()
                }}
              >
                Text
              </MobileAction>
              <MobileAction
                icon={PlusIcon}
                disabled={restoring}
                onClick={() => {
                  setMobileDrawer(null)
                  addBlankPage()
                }}
              >
                Blank page
              </MobileAction>
              <MobileAction
                icon={FilePlus2Icon}
                disabled={busy || restoring}
                onClick={() => {
                  setMobileDrawer(null)
                  appendInputRef.current?.click()
                }}
              >
                PDF pages…
              </MobileAction>
            </MobileActionGroup>

            <Separator />

            <MobileActionGroup label="Page">
              <MobileAction
                icon={CopyIcon}
                disabled={!selectedPageId}
                onClick={() => selectedPageId && duplicatePage(selectedPageId)}
              >
                Duplicate page
              </MobileAction>
              <MobileAction
                icon={RotateCwIcon}
                disabled={!selectedPageId}
                onClick={() => selectedPageId && rotatePage(selectedPageId)}
              >
                Rotate clockwise
              </MobileAction>
              <MobileAction
                icon={Trash2Icon}
                variant="destructive"
                disabled={!selectedPageId}
                onClick={() => {
                  setMobileDrawer(null)
                  if (selectedPageId) setDeletePageId(selectedPageId)
                }}
              >
                Delete page
              </MobileAction>
            </MobileActionGroup>
          </div>
        </ScrollArea>
      </MobileDrawer>

      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => handlePdfInput(event)}
      />
      <input
        ref={appendInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => handlePdfInput(event, true)}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void addImageFile(file)
        }}
      />

      <AlertDialog
        open={Boolean(deletePageId)}
        onOpenChange={(open) => {
          if (!open) setDeletePageId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete page?</AlertDialogTitle>
            <AlertDialogDescription>This removes the page and its layers.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deletePageId) deletePage(deletePageId)
                setDeletePageId(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
