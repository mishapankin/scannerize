"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { acquireDocumentLease, type DocumentLease } from "@/lib/document-lock"
import {
  getDocumentHash,
  getDocumentIdFromHash,
} from "@/lib/document-location"
import {
  clearRuntimeAssets,
  getPersistenceErrorMessage,
  loadPersistedWorkspace,
  requestPersistentStorage,
  retainRuntimeAssetsForDocument,
  saveWorkspace,
  type PersistedWorkspace,
} from "@/lib/editor-persistence"
import { clearEditorHistory, useEditorStore } from "@/lib/editor-store"

export type PersistenceStatus =
  | "loading"
  | "idle"
  | "saving"
  | "saved"
  | "conflict"
  | "error"

const SAVE_DELAY_MS = 350
const CLOSED_DOCUMENT_SESSION_KEY = "scannerize:document-closed"

function getWorkspaceSnapshot(): PersistedWorkspace | null {
  const state = useEditorStore.getState()
  if (!state.document) return null
  return {
    document: state.document,
    selectedPageId: state.selectedPageId,
    selectedLayerId: state.selectedLayerId,
  }
}

function updateDocumentLocation(documentId: string | null) {
  const url = new URL(window.location.href)
  url.hash = getDocumentHash(documentId)
  window.history.replaceState(null, "", url)
  if (documentId) sessionStorage.removeItem(CLOSED_DOCUMENT_SESSION_KEY)
  else sessionStorage.setItem(CLOSED_DOCUMENT_SESSION_KEY, "true")
}

export function useEditorPersistence() {
  const initializationRef = useRef<Promise<PersistedWorkspace | null> | null>(
    null
  )
  const closeHandlerRef = useRef<() => Promise<boolean>>(async () => false)
  const [status, setStatus] = useState<PersistenceStatus>("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let suppressStoreChanges = false
    let unsubscribe: (() => void) | undefined
    let saveTimer: number | undefined
    let activeLease: DocumentLease | null = null
    let activeWorkspace: PersistedWorkspace | null = null
    let pendingWorkspace: PersistedWorkspace | null = null
    let revision = 0
    let persistentStorageRequested = false
    let switchQueue = Promise.resolve()
    let commitPromise = Promise.resolve()

    const reportError = (cause: unknown) => {
      if (cancelled) return
      setStatus("error")
      setError(getPersistenceErrorMessage(cause))
    }

    const commit = (
      workspace: PersistedWorkspace,
      commitRevision: number
    ) => {
      const operation = async () => {
        if (activeLease?.documentId !== workspace.document.id) {
          throw new Error("This document is not owned by this tab.")
        }
        await saveWorkspace(workspace)
        if (!persistentStorageRequested) {
          persistentStorageRequested = true
          void requestPersistentStorage()
        }
        if (!cancelled && revision === commitRevision) {
          setStatus("saved")
          setError(null)
        }
      }
      commitPromise = commitPromise.then(operation, operation)
      return commitPromise
    }

    const schedule = (workspace: PersistedWorkspace) => {
      activeWorkspace = workspace
      revision += 1
      const scheduledRevision = revision
      if (saveTimer) window.clearTimeout(saveTimer)
      setStatus("saving")
      saveTimer = window.setTimeout(() => {
        saveTimer = undefined
        void commit(workspace, scheduledRevision).catch(reportError)
      }, SAVE_DELAY_MS)
    }

    const flushActive = async () => {
      if (saveTimer) window.clearTimeout(saveTimer)
      saveTimer = undefined
      if (activeWorkspace) await commit(activeWorkspace, revision)
      else await commitPromise
    }

    const performSwitch = async () => {
      const target = pendingWorkspace
      if (!target) return
      if (activeLease?.documentId === target.document.id) {
        pendingWorkspace = null
        schedule(target)
        return
      }

      try {
        await flushActive()
      } catch (cause) {
        reportError(cause)
      }
      activeLease?.release()
      activeLease = null
      activeWorkspace = null

      const lease = await acquireDocumentLease(target.document.id)
      if (pendingWorkspace?.document.id !== target.document.id) {
        lease?.release()
        return
      }
      if (!lease) {
        pendingWorkspace = null
        suppressStoreChanges = true
        useEditorStore.getState().resetDocument()
        suppressStoreChanges = false
        clearEditorHistory()
        await clearRuntimeAssets()
        setStatus("conflict")
        setError("This document is already open in another tab.")
        return
      }

      activeLease = lease
      pendingWorkspace = null
      await retainRuntimeAssetsForDocument(target.document)
      updateDocumentLocation(target.document.id)
      schedule(target)
    }

    const queueSwitch = (workspace: PersistedWorkspace) => {
      pendingWorkspace = workspace
      switchQueue = switchQueue.then(performSwitch, performSwitch)
      void switchQueue.catch(reportError)
    }

    const initialize = async () => {
      const requestedDocumentId = getDocumentIdFromHash(window.location.hash)
      const wasClosed =
        sessionStorage.getItem(CLOSED_DOCUMENT_SESSION_KEY) === "true"

      try {
        if (!requestedDocumentId && wasClosed) {
          initializationRef.current ??= Promise.resolve(null)
        } else {
          initializationRef.current ??= loadPersistedWorkspace(
            requestedDocumentId
          )
        }
        const persisted = await initializationRef.current
        if (cancelled) return

        const currentWorkspace = getWorkspaceSnapshot()
        if (currentWorkspace) {
          queueSwitch(currentWorkspace)
        } else if (persisted) {
          const lease = await acquireDocumentLease(persisted.document.id)
          if (cancelled) {
            lease?.release()
            return
          }
          if (!lease) {
            await clearRuntimeAssets()
            setStatus("conflict")
            setError("This document is already open in another tab.")
          } else {
            activeLease = lease
            activeWorkspace = persisted
            updateDocumentLocation(persisted.document.id)
            const state = useEditorStore.getState()
            state.setDocument(persisted.document)
            if (persisted.selectedPageId) {
              state.selectPage(persisted.selectedPageId)
            }
            if (persisted.selectedLayerId) {
              state.selectLayer(persisted.selectedLayerId)
            }
            activeWorkspace = getWorkspaceSnapshot()
            clearEditorHistory()
            setStatus("saved")
          }
        } else if (requestedDocumentId) {
          setStatus("error")
          setError("This saved document could not be found.")
        } else {
          setStatus("idle")
        }
      } catch (cause) {
        if (!cancelled) {
          setStatus("error")
          setError(
            cause instanceof Error
              ? `Recovery failed: ${cause.message}`
              : "Recovery failed. Open the source PDF again."
          )
        }
      }

      if (cancelled) return
      unsubscribe = useEditorStore.subscribe((state, previousState) => {
        if (suppressStoreChanges) return
        if (
          state.document === previousState.document &&
          state.selectedPageId === previousState.selectedPageId &&
          state.selectedLayerId === previousState.selectedLayerId
        ) {
          return
        }

        const workspace = getWorkspaceSnapshot()
        if (!workspace) return
        if (activeLease?.documentId === workspace.document.id) {
          schedule(workspace)
        } else {
          queueSwitch(workspace)
        }
      })
    }

    const flushOnExit = () => {
      if (saveTimer) window.clearTimeout(saveTimer)
      saveTimer = undefined
      if (activeWorkspace) void commit(activeWorkspace, revision)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushOnExit()
    }

    closeHandlerRef.current = async () => {
      try {
        await switchQueue
        await flushActive()
      } catch (cause) {
        reportError(cause)
        return false
      }

      suppressStoreChanges = true
      useEditorStore.getState().resetDocument()
      suppressStoreChanges = false
      clearEditorHistory()
      activeLease?.release()
      activeLease = null
      activeWorkspace = null
      pendingWorkspace = null
      updateDocumentLocation(null)
      await clearRuntimeAssets()
      setStatus("idle")
      setError(null)
      return true
    }

    void initialize()
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("pagehide", flushOnExit)

    return () => {
      flushOnExit()
      cancelled = true
      if (saveTimer) window.clearTimeout(saveTimer)
      unsubscribe?.()
      activeLease?.release()
      closeHandlerRef.current = async () => false
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("pagehide", flushOnExit)
    }
  }, [])

  const closeDocument = useCallback(() => closeHandlerRef.current(), [])
  return { status, error, closeDocument }
}
