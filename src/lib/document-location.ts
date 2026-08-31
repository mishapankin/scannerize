const DOCUMENT_HASH_KEY = "document"
const DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

export function getDocumentIdFromHash(hash: string) {
  const parameters = new URLSearchParams(hash.replace(/^#/, ""))
  const documentId = parameters.get(DOCUMENT_HASH_KEY)
  return documentId && DOCUMENT_ID_PATTERN.test(documentId) ? documentId : null
}

export function getDocumentHash(documentId: string | null) {
  if (!documentId) return ""
  return `#${DOCUMENT_HASH_KEY}=${encodeURIComponent(documentId)}`
}
