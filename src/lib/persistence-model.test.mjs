import assert from "node:assert/strict"
import test from "node:test"

import {
  collectAssetReferences,
  resolvePersistedSelection,
} from "./persistence-model.ts"

const document = {
  id: "document-1",
  name: "Test",
  pages: [
    {
      id: "page-1",
      name: "Page 1",
      widthPt: 600,
      heightPt: 800,
      rotation: 0,
      background: { type: "pdf", sourceId: "pdf-1", pageNumber: 1 },
      layers: [
        {
          id: "image-1",
          type: "image",
          name: "Logo",
          assetId: "asset-1",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
        },
      ],
    },
    {
      id: "page-2",
      name: "Page 2",
      widthPt: 600,
      heightPt: 800,
      rotation: 0,
      background: { type: "pdf", sourceId: "pdf-1", pageNumber: 2 },
      layers: [],
    },
  ],
}

test("asset references are unique and stable", () => {
  assert.deepEqual(collectAssetReferences(document), {
    pdfSourceIds: ["pdf-1"],
    imageAssetIds: ["asset-1"],
  })
})

test("persisted selection falls back to a valid page and layer", () => {
  assert.deepEqual(
    resolvePersistedSelection(document, "missing-page", "image-1"),
    { selectedPageId: "page-1", selectedLayerId: "image-1" }
  )
  assert.deepEqual(
    resolvePersistedSelection(document, "page-2", "image-1"),
    { selectedPageId: "page-2", selectedLayerId: null }
  )
})
