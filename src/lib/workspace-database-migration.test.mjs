import assert from "node:assert/strict"
import test from "node:test"
import "fake-indexeddb/auto"

globalThis.window = globalThis

const { default: Dexie } = await import("dexie")

const legacy = new Dexie("scannerize:root")
legacy.version(1).stores({
  documents: "id, updatedAt",
  pdfAssets: "id",
  imageAssets: "id",
  settings: "key",
})
await legacy.documents.put({
  id: "legacy-document",
  schemaVersion: 1,
  updatedAt: 1,
  document: {
    id: "legacy-document",
    name: "Legacy",
    pages: [
      {
        id: "legacy-page",
        name: "Page 1",
        widthPt: 600,
        heightPt: 800,
        rotation: 0,
        background: { type: "pdf", sourceId: "legacy-pdf", pageNumber: 1 },
        layers: [],
      },
    ],
  },
  selectedPageId: "legacy-page",
  selectedLayerId: null,
})
await legacy.pdfAssets.put({
  id: "legacy-pdf",
  name: "legacy.pdf",
  bytes: new Uint8Array([1]),
})
await legacy.settings.put({
  key: "activeDocumentId",
  value: "legacy-document",
})
legacy.close()

const { readDocumentRecord, readStoredAssets } = await import(
  "./workspace-database.ts"
)

test("version 1 autosaves migrate without losing their asset owner", async () => {
  const record = await readDocumentRecord("legacy-document")
  const assets = await readStoredAssets(["legacy-pdf"], [])

  assert.equal(record?.document.name, "Legacy")
  assert.equal(assets.pdfAssets[0]?.documentId, "legacy-document")
})
