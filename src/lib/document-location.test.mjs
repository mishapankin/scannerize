import assert from "node:assert/strict"
import test from "node:test"

import {
  getDocumentHash,
  getDocumentIdFromHash,
} from "./document-location.ts"

test("document identity round-trips through a static-export-safe URL hash", () => {
  const documentId = "7dd3076e-f16a-4a68-912f-33bd16e3960e"
  assert.equal(getDocumentHash(documentId), `#document=${documentId}`)
  assert.equal(getDocumentIdFromHash(getDocumentHash(documentId)), documentId)
  assert.equal(getDocumentIdFromHash("#document=../../invalid"), null)
})
