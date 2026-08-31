"use client"

import {
  clearImageAssets,
  getPersistedImageAsset,
  restoreImageAsset,
  retainImageAssets,
} from "@/lib/asset-registry"
import {
  collectAssetReferences,
  resolvePersistedSelection,
} from "@/lib/persistence-model"
import {
  clearPdfSources,
  getPersistedPdfSource,
  restorePdfSource,
  retainPdfSources,
} from "@/lib/pdf-engine"
import type { EditorDocument } from "@/types/editor"
import {
  clearWorkspaceDatabase,
  readDocumentRecord,
  readStoredAssets,
  writeWorkspaceToDatabase,
} from "@/lib/workspace-database"

const DOCUMENT_SCHEMA_VERSION = 1

export type PersistedWorkspace = {
  document: EditorDocument
  selectedPageId: string | null
  selectedLayerId: string | null
}

let writeQueue: Promise<void> = Promise.resolve()

function enqueueWrite(operation: () => Promise<void>) {
  const result = writeQueue.then(operation)
  writeQueue = result.catch(() => undefined)
  return result
}

function requirePdfAssets(ids: string[]) {
  return ids.map((id) => {
    const asset = getPersistedPdfSource(id)
    if (!asset) throw new Error(`PDF source ${id} is unavailable.`)
    return asset
  })
}

function requireImageAssets(ids: string[]) {
  return ids.map((id) => {
    const asset = getPersistedImageAsset(id)
    if (!asset) throw new Error(`Image source ${id} is unavailable.`)
    return asset
  })
}

export function saveWorkspace(workspace: PersistedWorkspace) {
  const snapshot = structuredClone(workspace)

  return enqueueWrite(async () => {
    const references = collectAssetReferences(snapshot.document)
    const pdfIds = new Set(references.pdfSourceIds)
    const imageIds = new Set(references.imageAssetIds)
    await writeWorkspaceToDatabase(
      {
        id: snapshot.document.id,
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        updatedAt: Date.now(),
        document: snapshot.document,
        selectedPageId: snapshot.selectedPageId,
        selectedLayerId: snapshot.selectedLayerId,
      },
      requirePdfAssets(references.pdfSourceIds),
      requireImageAssets(references.imageAssetIds),
      pdfIds,
      imageIds
    )

  })
}

export async function retainRuntimeAssetsForDocument(
  document: EditorDocument
) {
  const references = collectAssetReferences(document)
  await retainPdfSources(new Set(references.pdfSourceIds))
  retainImageAssets(new Set(references.imageAssetIds))
}

export async function clearRuntimeAssets() {
  await clearPdfSources()
  clearImageAssets()
}

export function clearPersistedWorkspace() {
  return enqueueWrite(async () => {
    await clearWorkspaceDatabase()
    await clearPdfSources()
    clearImageAssets()
  })
}

export async function loadPersistedWorkspace(
  documentId?: string | null
): Promise<PersistedWorkspace | null> {
  const record = await readDocumentRecord(documentId)
  if (!record) return null
  if (record.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
    throw new Error("The saved document uses an unsupported format.")
  }

  const references = collectAssetReferences(record.document)
  const { pdfAssets, imageAssets } = await readStoredAssets(
    references.pdfSourceIds,
    references.imageAssetIds
  )
  if (pdfAssets.some((asset) => !asset) || imageAssets.some((asset) => !asset)) {
    throw new Error("The saved document is missing source files.")
  }

  await clearPdfSources()
  clearImageAssets()
  try {
    for (const asset of pdfAssets) {
      if (asset) await restorePdfSource(asset)
    }
    for (const asset of imageAssets) {
      if (asset) await restoreImageAsset(asset)
    }
  } catch (error) {
    await clearPdfSources()
    clearImageAssets()
    throw error
  }

  return {
    document: record.document,
    ...resolvePersistedSelection(
      record.document,
      record.selectedPageId,
      record.selectedLayerId
    ),
  }
}

export async function requestPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return false
  }
  return navigator.storage.persist()
}

export function getPersistenceErrorMessage(error: unknown) {
  if (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  ) {
    return "Autosave storage is full. Export the PDF before reloading."
  }
  if (error instanceof Error && error.message) {
    return `Autosave failed: ${error.message}`
  }
  return "Autosave failed. Export the PDF before reloading."
}
