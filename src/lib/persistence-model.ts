import type { EditorDocument } from "@/types/editor"

export type AssetReferences = {
  pdfSourceIds: string[]
  imageAssetIds: string[]
}

export function collectAssetReferences(
  document: EditorDocument
): AssetReferences {
  const pdfSourceIds = new Set<string>()
  const imageAssetIds = new Set<string>()

  for (const page of document.pages) {
    if (page.background.type === "pdf") {
      pdfSourceIds.add(page.background.sourceId)
    }
    for (const layer of page.layers) {
      if (layer.type === "image") imageAssetIds.add(layer.assetId)
    }
  }

  return {
    pdfSourceIds: Array.from(pdfSourceIds),
    imageAssetIds: Array.from(imageAssetIds),
  }
}

export function resolvePersistedSelection(
  document: EditorDocument,
  selectedPageId: string | null,
  selectedLayerId: string | null
) {
  const page =
    document.pages.find((item) => item.id === selectedPageId) ??
    document.pages[0] ??
    null
  const layer = page?.layers.find((item) => item.id === selectedLayerId) ?? null

  return {
    selectedPageId: page?.id ?? null,
    selectedLayerId: layer?.id ?? null,
  }
}
