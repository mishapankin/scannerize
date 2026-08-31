"use client"

export type DocumentLease = {
  documentId: string
  release: () => void
}

type LockMessage = {
  type: "candidate" | "owner" | "release"
  tabId: string
}

const TAB_ID = crypto.randomUUID()
const ELECTION_DURATION_MS = 100

function getLockName(documentId: string) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "root"
  return `scannerize:${basePath}:${documentId}`
}

async function acquireWebLock(
  documentId: string
): Promise<DocumentLease | null> {
  return new Promise((resolve, reject) => {
    let settled = false
    let releaseLock: () => void = () => undefined
    const holdLock = new Promise<void>((release) => {
      releaseLock = release
    })

    void navigator.locks
      .request(
        getLockName(documentId),
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          settled = true
          if (!lock) {
            resolve(null)
            return
          }
          resolve({ documentId, release: releaseLock })
          await holdLock
        }
      )
      .catch((error) => {
        if (!settled) reject(error)
      })
  })
}

async function acquireBroadcastLock(
  documentId: string
): Promise<DocumentLease | null> {
  if (!("BroadcastChannel" in window)) return null

  const channel = new BroadcastChannel(getLockName(documentId))
  const contenders = new Set([TAB_ID])
  let ownerPresent = false
  let active = false

  const onMessage = (event: MessageEvent<LockMessage>) => {
    const message = event.data
    if (!message || message.tabId === TAB_ID) return
    if (message.type === "candidate") {
      contenders.add(message.tabId)
      if (active) channel.postMessage({ type: "owner", tabId: TAB_ID })
    } else if (message.type === "owner") {
      ownerPresent = true
    }
  }

  channel.addEventListener("message", onMessage)
  channel.postMessage({ type: "candidate", tabId: TAB_ID })
  await new Promise((resolve) => window.setTimeout(resolve, ELECTION_DURATION_MS))

  const winner = Array.from(contenders).sort()[0]
  if (ownerPresent || winner !== TAB_ID) {
    channel.removeEventListener("message", onMessage)
    channel.close()
    return null
  }

  active = true
  channel.postMessage({ type: "owner", tabId: TAB_ID })
  return {
    documentId,
    release: () => {
      if (!active) return
      active = false
      channel.postMessage({ type: "release", tabId: TAB_ID })
      channel.removeEventListener("message", onMessage)
      channel.close()
    },
  }
}

export async function acquireDocumentLease(documentId: string) {
  if (navigator.locks) {
    try {
      return await acquireWebLock(documentId)
    } catch {
      // Fall through to same-origin tab coordination when Web Locks is blocked.
    }
  }
  return acquireBroadcastLock(documentId)
}
