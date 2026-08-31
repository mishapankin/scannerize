import Dexie, { type EntityTable } from "dexie"

import type { EditorDocument } from "@/types/editor"

const ACTIVE_DOCUMENT_KEY = "activeDocumentId"

export type StoredDocumentRecord = {
  id: string
  schemaVersion: number
  updatedAt: number
  document: EditorDocument
  selectedPageId: string | null
  selectedLayerId: string | null
}

export type StoredPdfAsset = {
  id: string
  documentId: string
  name: string
  bytes: Uint8Array
}

export type StoredImageAsset = {
  id: string
  documentId: string
  name: string
  blob: Blob
}

type PdfAssetInput = Omit<StoredPdfAsset, "documentId">
type ImageAssetInput = Omit<StoredImageAsset, "documentId">

type SettingRecord = {
  key: string
  value: string
}

type ScannerizeDatabase = Dexie & {
  documents: EntityTable<StoredDocumentRecord, "id">
  pdfAssets: EntityTable<StoredPdfAsset, "id">
  imageAssets: EntityTable<StoredImageAsset, "id">
  settings: EntityTable<SettingRecord, "key">
}

let database: ScannerizeDatabase | null = null

function getDatabase() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error("This browser does not support local document storage.")
  }
  if (database) return database

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "root"
  const db = new Dexie(`scannerize:${basePath}`) as ScannerizeDatabase
  db.version(1).stores({
    documents: "id, updatedAt",
    pdfAssets: "id",
    imageAssets: "id",
    settings: "key",
  })
  db.version(2)
    .stores({
      documents: "id, updatedAt",
      pdfAssets: "id, documentId",
      imageAssets: "id, documentId",
      settings: "key",
    })
    .upgrade(async (transaction) => {
      const documents = (await transaction
        .table("documents")
        .toArray()) as StoredDocumentRecord[]
      const pdfOwners = new Map<string, string>()
      const imageOwners = new Map<string, string>()

      for (const record of documents) {
        for (const page of record.document.pages) {
          if (page.background.type === "pdf") {
            pdfOwners.set(page.background.sourceId, record.id)
          }
          for (const layer of page.layers) {
            if (layer.type === "image") imageOwners.set(layer.assetId, record.id)
          }
        }
      }

      await transaction
        .table("pdfAssets")
        .toCollection()
        .modify((asset: StoredPdfAsset) => {
          asset.documentId = pdfOwners.get(asset.id) ?? documents[0]?.id ?? "orphan"
        })
      await transaction
        .table("imageAssets")
        .toCollection()
        .modify((asset: StoredImageAsset) => {
          asset.documentId =
            imageOwners.get(asset.id) ?? documents[0]?.id ?? "orphan"
        })
    })
  database = db
  return db
}

export async function writeWorkspaceToDatabase(
  record: StoredDocumentRecord,
  pdfAssets: PdfAssetInput[],
  imageAssets: ImageAssetInput[],
  referencedPdfIds: ReadonlySet<string>,
  referencedImageIds: ReadonlySet<string>
) {
  const db = getDatabase()
  await db.transaction(
    "rw",
    [db.documents, db.pdfAssets, db.imageAssets, db.settings],
    async () => {
      const storedPdfIds = new Set(
        (await db.pdfAssets.where("documentId").equals(record.id).primaryKeys()).map(
          String
        )
      )
      const storedImageIds = new Set(
        (
          await db.imageAssets
            .where("documentId")
            .equals(record.id)
            .primaryKeys()
        ).map(String)
      )
      const missingPdfAssets = pdfAssets.filter(
        (asset) => !storedPdfIds.has(asset.id)
      )
      const missingImageAssets = imageAssets.filter(
        (asset) => !storedImageIds.has(asset.id)
      )

      if (missingPdfAssets.length) {
        await db.pdfAssets.bulkPut(
          missingPdfAssets.map((asset) => ({ ...asset, documentId: record.id }))
        )
      }
      if (missingImageAssets.length) {
        await db.imageAssets.bulkPut(
          missingImageAssets.map((asset) => ({
            ...asset,
            documentId: record.id,
          }))
        )
      }

      const stalePdfIds = Array.from(storedPdfIds).filter(
        (id) => !referencedPdfIds.has(id)
      )
      const staleImageIds = Array.from(storedImageIds).filter(
        (id) => !referencedImageIds.has(id)
      )
      if (stalePdfIds.length) await db.pdfAssets.bulkDelete(stalePdfIds)
      if (staleImageIds.length) {
        await db.imageAssets.bulkDelete(staleImageIds)
      }

      await db.documents.put(record)
      await db.settings.put({
        key: ACTIVE_DOCUMENT_KEY,
        value: record.id,
      })
    }
  )
}

export async function readDocumentRecord(documentId?: string | null) {
  const db = getDatabase()
  if (documentId) return (await db.documents.get(documentId)) ?? null
  const setting = await db.settings.get(ACTIVE_DOCUMENT_KEY)
  if (!setting) return null
  return (await db.documents.get(setting.value)) ?? null
}

export async function readStoredAssets(
  pdfIds: string[],
  imageIds: string[]
) {
  const db = getDatabase()
  const [pdfAssets, imageAssets] = await Promise.all([
    db.pdfAssets.bulkGet(pdfIds),
    db.imageAssets.bulkGet(imageIds),
  ])
  return { pdfAssets, imageAssets }
}

export async function clearWorkspaceDatabase() {
  const db = getDatabase()
  await db.transaction(
    "rw",
    [db.documents, db.pdfAssets, db.imageAssets, db.settings],
    async () => {
      await Promise.all([
        db.documents.clear(),
        db.pdfAssets.clear(),
        db.imageAssets.clear(),
        db.settings.delete(ACTIVE_DOCUMENT_KEY),
      ])
    }
  )
}
