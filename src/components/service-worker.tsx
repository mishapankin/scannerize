"use client";

import { useEffect } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const scope = basePath ? `${basePath}/` : "/";
    void navigator.serviceWorker
      .register(`${basePath}/sw.js`, { scope })
      .catch(() => undefined);
  }, []);

  return null;
}
