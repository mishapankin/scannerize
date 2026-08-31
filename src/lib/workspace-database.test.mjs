import assert from "node:assert/strict"
import test from "node:test"
import "fake-indexeddb/auto"

globalThis.window = globalThis

const {
  clearWorkspaceDatabase,
  readDocumentRecord,
  readStoredAssets,
  writeWorkspaceToDatabase,
} = await import("./workspace-database.ts")

const page = {
  id: "persisted-page",
  name: "Page 1",
  widthPt: 595.28,
  heightPt: 841.89,
  rotation: 0,
  background: { type: "blank", color: "#ffffff" },
  layers: [],
}

test("Dexie keeps documents and their assets isolated", async () => {
  await clearWorkspaceDatabase()
  await writeWorkspaceToDatabase(
    {
      id: "persisted-document",
      schemaVersion: 1,
      updatedAt: 1,
      document: {
        id: "persisted-document",
        name: "Recovered document",
        pages: [page],
      },
      selectedPageId: page.id,
      selectedLayerId: null,
    },
    [{ id: "pdf-1", name: "source.pdf", bytes: new Uint8Array([1, 2, 3]) }],
    [{ id: "image-1", name: "logo.png", blob: new Blob(["image"]) }],
    new Set(["pdf-1"]),
    new Set(["image-1"])
  )

  await writeWorkspaceToDatabase(
    {
      id: "second-document",
      schemaVersion: 1,
      updatedAt: 2,
      document: {
        id: "second-document",
        name: "Second document",
        pages: [{ ...page, id: "second-page" }],
      },
      selectedPageId: "second-page",
      selectedLayerId: null,
    },
    [],
    [{ id: "image-2", name: "photo.png", blob: new Blob(["photo"]) }],
    new Set(),
    new Set(["image-2"])
  )

  const firstRecord = await readDocumentRecord("persisted-document")
  const secondRecord = await readDocumentRecord("second-document")
  assert.equal(firstRecord?.document.name, "Recovered document")
  assert.equal(firstRecord?.selectedPageId, page.id)
  assert.equal(secondRecord?.document.name, "Second document")

  const assets = await readStoredAssets(["pdf-1"], ["image-1", "image-2"])
  assert.deepEqual(assets.pdfAssets[0]?.bytes, new Uint8Array([1, 2, 3]))
  assert.equal(assets.imageAssets[0]?.blob.size, 5)
  assert.equal(assets.imageAssets[1]?.blob.size, 5)

  await clearWorkspaceDatabase()
  assert.equal(await readDocumentRecord(), null)
})
