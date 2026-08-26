"use client"

import {
  type ChangeEvent,
  type ComponentProps,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileImageIcon,
  FilePlus2Icon,
  GripVerticalIcon,
  ImagePlusIcon,
  Layers3Icon,
  LockIcon,
  PlusIcon,
  Redo2Icon,
  RotateCwIcon,
  ScanLineIcon,
  TextCursorInputIcon,
  Trash2Icon,
  Undo2Icon,
  UnlockIcon,
} from "lucide-react"
import { useStore } from "zustand"

import { PageCanvas } from "@/components/editor/page-canvas"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
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
import { exportDocument, importPdfFile, renderPageComposite } from "@/lib/pdf-engine"
import { cn } from "@/lib/utils"
import type { EditorLayer, EditorPage, TextLayer } from "@/types/editor"

type IconButtonProps = ComponentProps<typeof Button> & {
  label: string
}

const MAX_THUMBNAIL_WIDTH = 132
const MAX_THUMBNAIL_HEIGHT = 160
const MAX_THUMBNAIL_SCALE = 0.24
const MAX_THUMBNAIL_PIXEL_RATIO = 2

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

function PageRail({ onDelete }: { onDelete: (pageId: string) => void }) {
  const document = useEditorStore((state) => state.document)
  const selectedPageId = useEditorStore((state) => state.selectedPageId)
  const selectPage = useEditorStore((state) => state.selectPage)
  const addBlankPage = useEditorStore((state) => state.addBlankPage)
  const duplicatePage = useEditorStore((state) => state.duplicatePage)
  const rotatePage = useEditorStore((state) => state.rotatePage)
  const movePage = useEditorStore((state) => state.movePage)
  const draggedPage = useRef<string | null>(null)

  return (
    <aside className="flex h-full min-w-0 flex-col bg-sidebar">
      <div className="panel-heading">
        <span>Pages</span>
        <span className="text-muted-foreground">{document?.pages.length ?? 0}</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 p-3">
          {document?.pages.map((page, index) => (
            <ContextMenu key={page.id}>
              <ContextMenuTrigger>
                <button
                  type="button"
                  draggable
                  onDragStart={() => {
                    draggedPage.current = page.id
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedPage.current) {
                      movePage(draggedPage.current, page.id)
                    }
                    draggedPage.current = null
                  }}
                  onClick={() => selectPage(page.id)}
                  className={cn(
                    "group flex w-full flex-col gap-2 rounded-lg border p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selectedPageId === page.id
                      ? "border-primary bg-sidebar-accent"
                      : "border-sidebar-border hover:bg-sidebar-accent/60"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <GripVerticalIcon className="size-3 text-muted-foreground" />
                    {index + 1}
                    <span className="ml-auto truncate text-muted-foreground">
                      {Math.round(page.widthPt)} × {Math.round(page.heightPt)}
                    </span>
                  </span>
                  <span className="flex min-h-28 items-center justify-center overflow-hidden rounded-md border bg-workspace p-2">
                    <PageThumbnail page={page} />
                  </span>
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
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-2">
        <Button variant="ghost" className="w-full" onClick={addBlankPage}>
          <PlusIcon data-icon="inline-start" />
          Add page
        </Button>
      </div>
    </aside>
  )
}

function LayerRow({ page, layer }: { page: EditorPage; layer: EditorLayer }) {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const deleteLayer = useEditorStore((state) => state.deleteLayer)
  const moveLayer = useEditorStore((state) => state.moveLayer)
  return (
    <div
      draggable={!layer.locked}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-scannerize-layer", layer.id)
        event.dataTransfer.effectAllowed = "move"
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const draggedLayerId = event.dataTransfer.getData(
          "application/x-scannerize-layer"
        )
        if (draggedLayerId) {
          moveLayer(page.id, draggedLayerId, layer.id)
        }
      }}
      className={cn(
        "group flex h-9 items-center gap-1 border-b px-2 text-sm",
        selectedLayerId === layer.id && "bg-accent"
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => selectLayer(layer.id)}
      >
        <GripVerticalIcon className="size-3 text-muted-foreground" />
        {layer.type === "image" ? (
          <FileImageIcon className="size-4" />
        ) : (
          <TextCursorInputIcon className="size-4" />
        )}
        <span className="truncate">{layer.name}</span>
      </button>
      <IconButton
        label={layer.visible ? "Hide layer" : "Show layer"}
        onClick={() =>
          updateLayer(page.id, layer.id, { visible: !layer.visible })
        }
      >
        {layer.visible ? <EyeIcon /> : <EyeOffIcon />}
      </IconButton>
      <IconButton
        label={layer.locked ? "Unlock layer" : "Lock layer"}
        onClick={() => updateLayer(page.id, layer.id, { locked: !layer.locked })}
      >
        {layer.locked ? <LockIcon /> : <UnlockIcon />}
      </IconButton>
      <IconButton
        label="Delete layer"
        onClick={() => deleteLayer(page.id, layer.id)}
      >
        <Trash2Icon />
      </IconButton>
    </div>
  )
}

function LayerProperties({ page, layer }: { page: EditorPage; layer: EditorLayer }) {
  const updateLayer = useEditorStore((state) => state.updateLayer)

  return (
    <div className="p-3">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="layer-name">Name</FieldLabel>
          <Input
            id="layer-name"
            value={layer.name}
            onChange={(event) =>
              updateLayer(page.id, layer.id, { name: event.target.value })
            }
          />
        </Field>

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
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field>
                <FieldLabel>Align</FieldLabel>
                <div className="flex gap-1">
                  {(
                    [
                      ["left", AlignLeftIcon],
                      ["center", AlignCenterIcon],
                      ["right", AlignRightIcon],
                    ] as const
                  ).map(([align, Icon]) => (
                    <Button
                      key={align}
                      size="icon-sm"
                      variant={layer.align === align ? "secondary" : "outline"}
                      aria-label={`Align ${align}`}
                      onClick={() => updateLayer(page.id, layer.id, { align })}
                    >
                      <Icon />
                    </Button>
                  ))}
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="text-color">Color</FieldLabel>
                <Input
                  id="text-color"
                  type="color"
                  className="w-12 px-1"
                  value={layer.fill}
                  onChange={(event) =>
                    updateLayer(page.id, layer.id, { fill: event.target.value })
                  }
                />
              </Field>
            </div>
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

function LayersPanel({ page }: { page: EditorPage | null }) {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer)
  const selectedLayer = page?.layers.find(
    (layer) => layer.id === selectedLayerId
  )

  return (
    <aside className="flex h-full min-w-0 flex-col bg-sidebar">
      <div className="panel-heading">
        <span>Layers</span>
        {page && selectedLayer && (
          <IconButton
            label="Duplicate layer"
            onClick={() => duplicateLayer(page.id, selectedLayer.id)}
          >
            <CopyIcon />
          </IconButton>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {!page ? null : page.layers.length === 0 ? (
          <Empty className="h-full rounded-none border-0">
            <EmptyMedia variant="icon">
              <Layers3Icon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No layers</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col-reverse">
              {page.layers.map((layer) => (
                <LayerRow key={layer.id} page={page} layer={layer} />
              ))}
            </div>
            <div className="flex h-9 items-center gap-2 border-b px-3 text-sm text-muted-foreground">
              <LockIcon className="size-3.5" /> Background
            </div>
          </ScrollArea>
        )}
      </div>
      {page && selectedLayer && (
        <>
          <Separator />
          <div className="max-h-[48%] overflow-y-auto">
            <LayerProperties page={page} layer={selectedLayer} />
          </div>
        </>
      )}
    </aside>
  )
}

function Workspace({ page }: { page: EditorPage | null }) {
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
        <PageCanvas page={page} width={size.width} height={size.height} />
      ) : (
        <Empty className="h-full rounded-none border-0">
          <EmptyMedia variant="icon">
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

export default function Editor() {
  const document = useEditorStore((state) => state.document)
  const selectedPageId = useEditorStore((state) => state.selectedPageId)
  const setDocument = useEditorStore((state) => state.setDocument)
  const appendPages = useEditorStore((state) => state.appendPages)
  const addBlankPage = useEditorStore((state) => state.addBlankPage)
  const addLayer = useEditorStore((state) => state.addLayer)
  const deletePage = useEditorStore((state) => state.deletePage)
  const selectedPage =
    document?.pages.find((page) => page.id === selectedPageId) ?? null
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletePageId, setDeletePageId] = useState<string | null>(null)
  const [exportState, setExportState] = useState<{
    current: number
    total: number
  } | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches("input, textarea, select, [contenteditable=true]")) return
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [redo, undo])

  async function openPdf(file: File, append = false) {
    setBusy(true)
    setError(null)
    try {
      const imported = await importPdfFile(file)
      if (append && document) {
        appendPages(imported.pages)
      } else {
        setDocument({
          id: crypto.randomUUID(),
          name: imported.name,
          pages: imported.pages,
        })
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

  async function runExport(dpi: number) {
    if (!document || document.pages.length === 0) return
    setError(null)
    setExportState({ current: 0, total: document.pages.length })
    try {
      await window.document.fonts.ready
      await exportDocument(document.name, document.pages, dpi, (current, total) =>
        setExportState({ current, total })
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.")
    } finally {
      setExportState(null)
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
      <header className="toolbar">
        <div className="brand" aria-label="Scannerize">
          <ScanLineIcon />
          <span>Scannerize</span>
        </div>
        <Separator orientation="vertical" className="h-5" />
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => pdfInputRef.current?.click()}
        >
          <FilePlus2Icon data-icon="inline-start" />
          Open
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => imageInputRef.current?.click()}
        >
          <ImagePlusIcon data-icon="inline-start" />
          Image
        </Button>
        <Button variant="ghost" size="sm" onClick={addText}>
          <TextCursorInputIcon data-icon="inline-start" />
          Text
        </Button>
        <Separator orientation="vertical" className="h-5" />
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
        <div className="ml-auto flex items-center gap-1">
          {error && (
            <span className="max-w-64 truncate text-xs text-destructive" role="alert">
              {error}
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="sm"
                  disabled={!document?.pages.length || Boolean(exportState)}
                />
              }
            >
              <DownloadIcon data-icon="inline-start" />
              Export
              <ChevronDownIcon data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => void runExport(96)}>
                  Screen · 96 DPI
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runExport(150)}>
                  Standard · 150 DPI
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runExport(300)}>
                  Print · 300 DPI
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

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

      <div className="mobile-blocker">
        <ScanLineIcon />
        <span>Use a wider screen to edit.</span>
      </div>

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
