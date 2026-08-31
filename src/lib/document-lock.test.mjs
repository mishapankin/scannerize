import assert from "node:assert/strict"
import test from "node:test"

const heldLocks = new Set()
const locks = {
  request(name, options, callback) {
    if (options.ifAvailable && heldLocks.has(name)) {
      return Promise.resolve(callback(null))
    }
    heldLocks.add(name)
    return Promise.resolve(callback({ name })).finally(() => heldLocks.delete(name))
  },
}

Object.defineProperty(globalThis.navigator, "locks", {
  configurable: true,
  value: locks,
})

const { acquireDocumentLease } = await import("./document-lock.ts")

test("document locks allow different documents but reject a second editor", async () => {
  const first = await acquireDocumentLease("document-a")
  const different = await acquireDocumentLease("document-b")
  const duplicate = await acquireDocumentLease("document-a")

  assert.ok(first)
  assert.ok(different)
  assert.equal(duplicate, null)

  first.release()
  different.release()
  await new Promise((resolve) => setTimeout(resolve, 0))

  const reopened = await acquireDocumentLease("document-a")
  assert.ok(reopened)
  reopened.release()
})
