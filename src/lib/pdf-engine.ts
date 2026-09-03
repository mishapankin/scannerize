import { PDFDocument } from "pdf-lib"
import type { PDFDocumentProxy } from "pdfjs-dist"

import { getImageAsset } from "@/lib/asset-registry"
import { getScaledBrushPoints } from "@/lib/brush-geometry"
import {
  buildExportPlan,
  type ExportPagePlan,
  type ExportSettings,
} from "@/lib/export-plan"
import { getTextLines, getTextResizeMode } from "@/lib/text-layout"
import {
  getScaledShapePoints,
  isShapeFillEnabled,
  isShapeStrokeEnabled,
} from "@/lib/shape-geometry"
import type {
  BrushLayer,
  EditorLayer,
  EditorPage,
  ShapeLayer,
} from "@/types/editor"

type PdfSource = {
  id: string
  name: string
  bytes: Uint8Array
  document: PDFDocumentProxy
}

export type PersistedPdfSource = Pick<PdfSource, "id" | "name" | "bytes">

const pdfSources = new Map<string, PdfSource>()
let workerConfigured = false

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist")
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString()
    workerConfigured = true
  }
  return pdfjs
}

export async function importPdfFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sourceId = crypto.randomUUID()
  const source = await registerPdfSource({
    id: sourceId,
    name: file.name,
    bytes,
  })
  const { document } = source

  try {
    const pages: EditorPage[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      pages.push({
        id: crypto.randomUUID(),
        name: `Page ${pageNumber}`,
        widthPt: viewport.width,
        heightPt: viewport.height,
        rotation: 0,
        background: { type: "pdf", sourceId, pageNumber },
        layers: [],
      })
      page.cleanup()
    }

    return {
      sourceId,
      name: file.name.replace(/\.pdf$/i, ""),
      pages,
    }
  } catch (error) {
    pdfSources.delete(sourceId)
    await document.cleanup()
    throw error
  }
}

async function registerPdfSource(asset: PersistedPdfSource) {
  const pdfjs = await getPdfJs()
  const document = await pdfjs.getDocument({ data: asset.bytes.slice() }).promise
  const previous = pdfSources.get(asset.id)
  if (previous) await previous.document.cleanup()

  const source = {
    id: asset.id,
    name: asset.name,
    bytes: asset.bytes,
    document,
  }
  pdfSources.set(asset.id, source)
  return source
}

export async function restorePdfSource(asset: PersistedPdfSource) {
  await registerPdfSource(asset)
}

export function getPersistedPdfSource(id: string): PersistedPdfSource | null {
  const source = pdfSources.get(id)
  if (!source) return null
  return { id: source.id, name: source.name, bytes: source.bytes }
}

export async function retainPdfSources(ids: ReadonlySet<string>) {
  const discarded = Array.from(pdfSources.entries()).filter(
    ([id]) => !ids.has(id)
  )
  for (const [id] of discarded) pdfSources.delete(id)
  await Promise.allSettled(
    discarded.map(([, source]) => source.document.cleanup())
  )
}

export async function clearPdfSources() {
  const sources = Array.from(pdfSources.values())
  pdfSources.clear()
  await Promise.allSettled(
    sources.map(async (source) => {
      await source.document.cleanup()
    })
  )
}

function drawTextLayer(
  context: CanvasRenderingContext2D,
  layer: Extract<EditorLayer, { type: "text" }>
) {
  context.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}"`
  context.fillStyle = layer.fill
  context.textBaseline = "top"
  context.textAlign = layer.align

  if (getTextResizeMode(layer) === "fixed") {
    context.beginPath()
    context.rect(0, 0, layer.width, layer.height)
    context.clip()
  }

  const anchorX =
    layer.align === "left" ? 0 : layer.align === "center" ? layer.width / 2 : layer.width
  const lines = getTextLines(context, layer)
  const lineHeight = layer.fontSize * layer.lineHeight

  for (const [index, line] of lines.entries()) {
    context.fillText(line, anchorX, index * lineHeight)
  }
}

function drawShapeLayer(
  context: CanvasRenderingContext2D,
  layer: ShapeLayer
) {
  const points = getScaledShapePoints(layer)
  const fillEnabled = isShapeFillEnabled(layer)
  const strokeEnabled = isShapeStrokeEnabled(layer)
  context.lineCap = "round"
  context.lineJoin = "round"
  context.lineWidth = layer.strokeWidth

  if (fillEnabled && layer.fill) context.fillStyle = layer.fill
  if (strokeEnabled && layer.stroke) context.strokeStyle = layer.stroke

  context.beginPath()
  switch (layer.shape) {
    case "rectangle":
      context.rect(0, 0, layer.width, layer.height)
      break
    case "ellipse":
      context.ellipse(
        layer.width / 2,
        layer.height / 2,
        layer.width / 2,
        layer.height / 2,
        0,
        0,
        Math.PI * 2
      )
      break
    case "polygon":
      if (points.length >= 6) {
        context.moveTo(points[0], points[1])
        for (let index = 2; index < points.length; index += 2) {
          context.lineTo(points[index], points[index + 1])
        }
        context.closePath()
      }
      break
    case "line":
    case "arrow":
      if (points.length >= 4) {
        context.moveTo(points[0], points[1])
        context.lineTo(points[2], points[3])
      }
      break
  }

  if (
    fillEnabled &&
    layer.fill &&
    (layer.shape === "rectangle" ||
      layer.shape === "ellipse" ||
      layer.shape === "polygon")
  ) {
    context.fill()
  }
  if (strokeEnabled && layer.stroke && layer.strokeWidth > 0) context.stroke()

  if (
    layer.shape === "arrow" &&
    strokeEnabled &&
    layer.stroke &&
    points.length >= 4
  ) {
    const startX = points[0]
    const startY = points[1]
    const endX = points[2]
    const endY = points[3]
    const angle = Math.atan2(endY - startY, endX - startX)
    const headLength = Math.max(8, layer.strokeWidth * 5)
    context.beginPath()
    context.moveTo(endX, endY)
    context.lineTo(
      endX - Math.cos(angle - Math.PI / 6) * headLength,
      endY - Math.sin(angle - Math.PI / 6) * headLength
    )
    context.lineTo(
      endX - Math.cos(angle + Math.PI / 6) * headLength,
      endY - Math.sin(angle + Math.PI / 6) * headLength
    )
    context.closePath()
    context.fillStyle = layer.stroke
    context.fill()
  }
}

function drawBrushLayer(
  context: CanvasRenderingContext2D,
  layer: BrushLayer
) {
  const points = getScaledBrushPoints(layer)
  if (points.length < 2) return

  context.fillStyle = layer.color
  context.strokeStyle = layer.color
  context.lineWidth = layer.strokeWidth
  context.lineCap = "round"
  context.lineJoin = "round"

  if (points.length === 2) {
    context.beginPath()
    context.arc(points[0], points[1], layer.strokeWidth / 2, 0, Math.PI * 2)
    context.fill()
    return
  }

  context.beginPath()
  context.moveTo(points[0], points[1])
  for (let index = 2; index < points.length; index += 2) {
    context.lineTo(points[index], points[index + 1])
  }
  context.stroke()
}

function drawLayer(context: CanvasRenderingContext2D, layer: EditorLayer) {
  if (!layer.visible) return

  context.save()
  context.globalAlpha = layer.opacity
  context.translate(layer.x, layer.y)
  context.rotate((layer.rotation * Math.PI) / 180)

  if (layer.type === "image") {
    const asset = getImageAsset(layer.assetId)
    if (asset) {
      context.drawImage(asset.image, 0, 0, layer.width, layer.height)
    }
  } else if (layer.type === "text") {
    drawTextLayer(context, layer)
  } else if (layer.type === "shape") {
    drawShapeLayer(context, layer)
  } else {
    drawBrushLayer(context, layer)
  }

  context.restore()
}

function enableHighQualityImageSmoothing(context: CanvasRenderingContext2D) {
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
}

async function renderBackground(
  page: EditorPage,
  canvas: HTMLCanvasElement,
  scale: number
) {
  const context = canvas.getContext("2d", { alpha: false })
  if (!context) throw new Error("Canvas is not available in this browser.")
  enableHighQualityImageSmoothing(context)

  context.fillStyle =
    page.background.type === "blank" ? page.background.color : "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)

  if (page.background.type === "blank") return

  const source = pdfSources.get(page.background.sourceId)
  if (!source) throw new Error("The PDF source is no longer available.")

  const pdfPage = await source.document.getPage(page.background.pageNumber)
  const viewport = pdfPage.getViewport({
    scale,
    rotation: pdfPage.rotate + page.rotation,
  })
  const renderCanvas = document.createElement("canvas")
  renderCanvas.width = Math.max(1, Math.ceil(viewport.width))
  renderCanvas.height = Math.max(1, Math.ceil(viewport.height))

  await pdfPage.render({ canvas: renderCanvas, viewport }).promise
  context.drawImage(renderCanvas, 0, 0, canvas.width, canvas.height)
  renderCanvas.width = 1
  renderCanvas.height = 1
  pdfPage.cleanup()
}

export async function renderPageComposite(page: EditorPage, scale: number) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.ceil(page.widthPt * scale))
  canvas.height = Math.max(1, Math.ceil(page.heightPt * scale))

  await renderBackground(page, canvas, scale)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Canvas is not available in this browser.")
  enableHighQualityImageSmoothing(context)

  context.save()
  context.scale(scale, scale)
  for (const layer of page.layers) drawLayer(context, layer)
  context.restore()

  return canvas
}

export async function renderPageBackground(page: EditorPage, scale: number) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.ceil(page.widthPt * scale))
  canvas.height = Math.max(1, Math.ceil(page.heightPt * scale))
  await renderBackground(page, canvas, scale)
  return canvas
}

function canvasToBytes(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/png",
  quality?: number
) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("The browser could not encode this page."))
          return
        }
        resolve(new Uint8Array(await blob.arrayBuffer()))
      },
      type,
      quality
    )
  })
}

async function renderExportPage(plan: ExportPagePlan, dpi: number) {
  const scale = dpi / 72
  const fit = Math.min(
    plan.widthPt / plan.page.widthPt,
    plan.heightPt / plan.page.heightPt
  )
  const composite = await renderPageComposite(plan.page, scale * fit)

  if (!plan.resized) return composite

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.ceil(plan.widthPt * scale))
  canvas.height = Math.max(1, Math.ceil(plan.heightPt * scale))
  const context = canvas.getContext("2d", { alpha: false })
  if (!context) throw new Error("Canvas is not available in this browser.")
  enableHighQualityImageSmoothing(context)
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(
    composite,
    (canvas.width - composite.width) / 2,
    (canvas.height - composite.height) / 2
  )
  composite.width = 1
  composite.height = 1
  return canvas
}

async function appendPreservedPage(
  output: PDFDocument,
  plan: ExportPagePlan,
  sourceDocuments: Map<string, PDFDocument>
) {
  if (plan.page.background.type !== "pdf") {
    throw new Error("Only imported PDF pages can be preserved.")
  }

  const { sourceId, pageNumber } = plan.page.background
  const source = pdfSources.get(sourceId)
  if (!source) throw new Error("The PDF source is no longer available.")

  let sourceDocument = sourceDocuments.get(sourceId)
  if (!sourceDocument) {
    sourceDocument = await PDFDocument.load(source.bytes.slice())
    sourceDocuments.set(sourceId, sourceDocument)
  }

  const [copiedPage] = await output.copyPages(sourceDocument, [pageNumber - 1])
  output.addPage(copiedPage)
}

export async function exportDocument(
  name: string,
  pages: EditorPage[],
  settings: ExportSettings,
  onProgress: (current: number, total: number) => void
) {
  const output = await PDFDocument.create()
  output.setTitle(name)
  output.setProducer("Scannerize")
  const plan = buildExportPlan(pages, settings)
  const sourceDocuments = new Map<string, PDFDocument>()

  for (const [index, pagePlan] of plan.pages.entries()) {
    onProgress(index, plan.pages.length)
    if (pagePlan.preserveOriginal) {
      await appendPreservedPage(output, pagePlan, sourceDocuments)
      continue
    }

    const canvas = await renderExportPage(pagePlan, settings.dpi)
    const bytes = await canvasToBytes(canvas, "image/jpeg", 0.92)
    const image = await output.embedJpg(bytes)
    const pdfPage = output.addPage([pagePlan.widthPt, pagePlan.heightPt])
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: pagePlan.widthPt,
      height: pagePlan.heightPt,
    })
    canvas.width = 1
    canvas.height = 1
  }

  onProgress(plan.pages.length, plan.pages.length)
  const bytes = await output.save()
  const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${name || "document"}.pdf`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
