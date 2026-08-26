import { PDFDocument } from "pdf-lib"
import type { PDFDocumentProxy } from "pdfjs-dist"

import { getImageAsset } from "@/lib/asset-registry"
import { getTextLines, getTextResizeMode } from "@/lib/text-layout"
import type { EditorLayer, EditorPage } from "@/types/editor"

type PdfSource = {
  id: string
  name: string
  bytes: Uint8Array
  document: PDFDocumentProxy
}

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
  const pdfjs = await getPdfJs()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const document = await pdfjs.getDocument({ data: bytes.slice() }).promise
  const sourceId = crypto.randomUUID()

  pdfSources.set(sourceId, {
    id: sourceId,
    name: file.name,
    bytes,
    document,
  })

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
  } else {
    drawTextLayer(context, layer)
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

export async function exportDocument(
  name: string,
  pages: EditorPage[],
  dpi: number,
  onProgress: (current: number, total: number) => void
) {
  const output = await PDFDocument.create()
  output.setTitle(name)
  output.setProducer("Scannerize")

  for (const [index, page] of pages.entries()) {
    onProgress(index, pages.length)
    const scale = dpi / 72
    const canvas = await renderPageComposite(page, scale)
    const bytes = await canvasToBytes(canvas, "image/jpeg", 0.92)
    const image = await output.embedJpg(bytes)
    const pdfPage = output.addPage([page.widthPt, page.heightPt])
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: page.widthPt,
      height: page.heightPt,
    })
    canvas.width = 1
    canvas.height = 1
  }

  onProgress(pages.length, pages.length)
  const bytes = await output.save()
  const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${name || "document"}.pdf`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
