"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  hasDeploymentUpdate,
  readDeploymentManifest,
} from "@/lib/app-update"

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
const currentVersion = process.env.NEXT_PUBLIC_BUILD_ID ?? ""
const CHECK_INTERVAL_MS = 30 * 60 * 1000
const UPDATE_CHANNEL = "scannerize:app-update"

type AppUpdateOptions = {
  blocked: boolean
  prepare: () => Promise<boolean>
}

type UpdateMessage = {
  type: "update-ready"
  version: string
}

export function useAppUpdate({ blocked, prepare }: AppUpdateOptions) {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const prepareRef = useRef(prepare)
  const reloadRequestedRef = useRef(false)
  const activatedUpdateRef = useRef(false)
  const remoteVersionRef = useRef("")
  const [available, setAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    prepareRef.current = prepare
  }, [prepare])

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!currentVersion || !("serviceWorker" in navigator)) return

    let cancelled = false
    let interval: number | undefined
    const controlledAtStart = Boolean(navigator.serviceWorker.controller)
    const scope = basePath ? `${basePath}/` : "/"
    const manifestUrl = `${basePath}/version.json`
    const channel =
      "BroadcastChannel" in window ? new BroadcastChannel(UPDATE_CHANNEL) : null
    channelRef.current = channel

    const announce = (message: UpdateMessage) => channel?.postMessage(message)
    const markReady = (version: string, broadcast = true) => {
      if (cancelled) return
      remoteVersionRef.current = version
      setAvailable(true)
      if (broadcast) announce({ type: "update-ready", version })
    }

    const watchInstallingWorker = (
      registration: ServiceWorkerRegistration,
      worker: ServiceWorker
    ) => {
      const onStateChange = () => {
        if (
          worker.state === "installed" &&
          navigator.serviceWorker.controller &&
          registration.waiting
        ) {
          markReady(remoteVersionRef.current || "updated-build")
        }
      }
      worker.addEventListener("statechange", onStateChange)
    }

    const checkForUpdate = async () => {
      if (cancelled || !navigator.onLine) return
      try {
        const url = new URL(manifestUrl, window.location.origin)
        url.searchParams.set("check", Date.now().toString(36))
        const response = await fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        })
        if (!response.ok) return
        const manifest = readDeploymentManifest(await response.json())
        if (!manifest || !hasDeploymentUpdate(currentVersion, manifest)) return

        remoteVersionRef.current = manifest.version
        const registration = registrationRef.current
        if (!registration) return
        if (registration.waiting) {
          markReady(manifest.version)
          return
        }
        await registration.update()
      } catch {
        // Offline and transient CDN failures must not affect the editor.
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate()
    }
    const onFocus = () => void checkForUpdate()
    const onOnline = () => void checkForUpdate()
    const onControllerChange = () => {
      if (reloadRequestedRef.current) {
        window.location.reload()
      } else if (controlledAtStart) {
        activatedUpdateRef.current = true
        setAvailable(true)
      }
    }
    const onChannelMessage = (event: MessageEvent<UpdateMessage>) => {
      const message = event.data
      if (
        !message ||
        message.type !== "update-ready" ||
        message.version === currentVersion
      ) {
        return
      }
      remoteVersionRef.current = message.version
      if (registrationRef.current?.waiting) {
        markReady(message.version, false)
      } else {
        void checkForUpdate()
      }
    }

    void navigator.serviceWorker
      .register(`${basePath}/sw.js`, {
        scope,
        updateViaCache: "none",
      })
      .then((registration) => {
        if (cancelled) return
        registrationRef.current = registration
        if (registration.waiting && navigator.serviceWorker.controller) {
          markReady("updated-build")
        }
        if (registration.installing) {
          watchInstallingWorker(registration, registration.installing)
        }
        registration.addEventListener("updatefound", () => {
          if (registration.installing) {
            watchInstallingWorker(registration, registration.installing)
          }
        })
        void checkForUpdate()
        interval = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS)
      })
      .catch(() => undefined)

    channel?.addEventListener("message", onChannelMessage)
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", onFocus)
    window.addEventListener("online", onOnline)
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    )

    return () => {
      cancelled = true
      if (interval) window.clearInterval(interval)
      channel?.removeEventListener("message", onChannelMessage)
      channel?.close()
      if (channelRef.current === channel) channelRef.current = null
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("online", onOnline)
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      )
    }
  }, [])

  const applyUpdate = useCallback(async () => {
    if (blocked || updating) return false
    const registration = registrationRef.current
    const worker = registration?.waiting
    if (!registration || (!worker && !activatedUpdateRef.current)) return false

    setUpdating(true)
    const prepared = await prepareRef.current()
    if (!prepared) {
      setUpdating(false)
      return false
    }

    reloadRequestedRef.current = true
    channelRef.current?.postMessage({
      type: "update-ready",
      version: remoteVersionRef.current || "updated-build",
    } satisfies UpdateMessage)
    if (worker) worker.postMessage({ type: "SKIP_WAITING" })
    else window.location.reload()
    return true
  }, [blocked, updating])

  return { available, updating, applyUpdate }
}
