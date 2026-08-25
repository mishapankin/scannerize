"use client"

import dynamic from "next/dynamic"

const Editor = dynamic(() => import("@/components/editor/editor"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
      Loading editor…
    </main>
  ),
})

export function EditorLoader() {
  return <Editor />
}
