import type { EditorPage } from "@/types/editor"

export const POINTS_PER_MM = 72 / 25.4

export type ExportDpi = 96 | 150 | 300
export type PageSizeMode = "original" | "limit-oversized" | "uniform"
export type PageSizeTarget = "auto" | "a4" | "letter" | "current" | "custom"

export type ExportSettings = {
  dpi: ExportDpi
  preserveUntouched: boolean
  pageSizeMode: PageSizeMode
  pageSizeTarget: PageSizeTarget
  currentPageId: string | null
  customWidthMm: number
  customHeightMm: number
}

export type ExportPagePlan = {
  page: EditorPage
  widthPt: number
  heightPt: number
  resized: boolean
  preserveOriginal: boolean
}

export type ExportPlan = {
  pages: ExportPagePlan[]
  resizedCount: number
  preservedCount: number
}

type PageSize = {
  widthPt: number
  heightPt: number
}

const A4_SIZE: PageSize = { widthPt: 595.28, heightPt: 841.89 }
const LETTER_SIZE: PageSize = { widthPt: 612, heightPt: 792 }
const SIZE_CLUSTER_TOLERANCE = 0.05
const OVERSIZED_THRESHOLD = 1.1

function portraitSize(size: PageSize): PageSize {
  return size.widthPt <= size.heightPt
    ? size
    : { widthPt: size.heightPt, heightPt: size.widthPt }
}

function orientLike(size: PageSize, page: EditorPage): PageSize {
  const portrait = portraitSize(size)
  return page.widthPt <= page.heightPt
    ? portrait
    : { widthPt: portrait.heightPt, heightPt: portrait.widthPt }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function sizesAreClose(a: PageSize, b: PageSize) {
  return (
    Math.abs(a.widthPt - b.widthPt) / Math.max(a.widthPt, b.widthPt) <=
      SIZE_CLUSTER_TOLERANCE &&
    Math.abs(a.heightPt - b.heightPt) / Math.max(a.heightPt, b.heightPt) <=
      SIZE_CLUSTER_TOLERANCE
  )
}

export function getDominantPageSize(pages: EditorPage[]): PageSize {
  if (pages.length === 0) return A4_SIZE

  const clusters: PageSize[][] = []
  for (const page of pages) {
    const size = portraitSize(page)
    const cluster = clusters.find((candidate) =>
      sizesAreClose(candidate[0], size)
    )
    if (cluster) cluster.push(size)
    else clusters.push([size])
  }

  const dominant = clusters.reduce((best, candidate) =>
    candidate.length > best.length ? candidate : best
  )

  return {
    widthPt: median(dominant.map((size) => size.widthPt)),
    heightPt: median(dominant.map((size) => size.heightPt)),
  }
}

function getRequestedSize(pages: EditorPage[], settings: ExportSettings) {
  switch (settings.pageSizeTarget) {
    case "a4":
      return A4_SIZE
    case "letter":
      return LETTER_SIZE
    case "current": {
      const current = pages.find((page) => page.id === settings.currentPageId)
      return current ? portraitSize(current) : getDominantPageSize(pages)
    }
    case "custom":
      return portraitSize({
        widthPt: Math.max(1, settings.customWidthMm) * POINTS_PER_MM,
        heightPt: Math.max(1, settings.customHeightMm) * POINTS_PER_MM,
      })
    case "auto":
      return getDominantPageSize(pages)
  }
}

function isRenderableLayer(layer: EditorPage["layers"][number]) {
  if (!layer.visible || layer.opacity <= 0) return false
  if (layer.type === "image") return true
  if (layer.type === "text") return layer.value.length > 0
  const fillEnabled = layer.fillEnabled ?? Boolean(layer.fill)
  const strokeEnabled = layer.strokeEnabled ?? Boolean(layer.stroke)
  return Boolean(
    (fillEnabled && layer.fill) ||
      (strokeEnabled && layer.stroke && layer.strokeWidth > 0)
  )
}

export function canPreserveOriginalPage(page: EditorPage) {
  return (
    page.background.type === "pdf" &&
    page.rotation === 0 &&
    !page.layers.some(isRenderableLayer)
  )
}

function sizesDiffer(a: PageSize, b: PageSize) {
  return (
    Math.abs(a.widthPt - b.widthPt) > 0.01 ||
    Math.abs(a.heightPt - b.heightPt) > 0.01
  )
}

export function buildExportPlan(
  pages: EditorPage[],
  settings: ExportSettings
): ExportPlan {
  const requestedSize = getRequestedSize(pages, settings)
  const plans = pages.map((page): ExportPagePlan => {
    const orientedTarget = orientLike(requestedSize, page)
    let outputSize: PageSize = page

    if (settings.pageSizeMode === "uniform") {
      outputSize = orientedTarget
    } else if (settings.pageSizeMode === "limit-oversized") {
      const isOversized =
        page.widthPt > orientedTarget.widthPt * OVERSIZED_THRESHOLD ||
        page.heightPt > orientedTarget.heightPt * OVERSIZED_THRESHOLD
      if (isOversized) outputSize = orientedTarget
    }

    const resized = sizesDiffer(page, outputSize)
    const preserveOriginal =
      settings.preserveUntouched &&
      !resized &&
      canPreserveOriginalPage(page)

    return {
      page,
      widthPt: outputSize.widthPt,
      heightPt: outputSize.heightPt,
      resized,
      preserveOriginal,
    }
  })

  return {
    pages: plans,
    resizedCount: plans.filter((page) => page.resized).length,
    preservedCount: plans.filter((page) => page.preserveOriginal).length,
  }
}
