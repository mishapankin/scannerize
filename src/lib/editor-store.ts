"use client"

import { temporal } from "zundo"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

import { measureTextLayer } from "@/lib/text-layout"
import type {
  EditorDocument,
  EditorLayer,
  EditorPage,
  ImageLayer,
  ShapeLayer,
  ShapeKind,
  TextLayer,
} from "@/types/editor"

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

function createBlankPage(index: number): EditorPage {
  return {
    id: crypto.randomUUID(),
    name: `Page ${index}`,
    widthPt: A4_WIDTH,
    heightPt: A4_HEIGHT,
    rotation: 0,
    background: { type: "blank", color: "#ffffff" },
    layers: [],
  }
}

function cloneLayer(layer: EditorLayer): EditorLayer {
  return {
    ...layer,
    ...(layer.type === "shape" ? { points: [...layer.points] } : {}),
    id: crypto.randomUUID(),
    name: `${layer.name} copy`,
    x: layer.x + 12,
    y: layer.y + 12,
  }
}

type EditorState = {
  document: EditorDocument | null
  selectedPageId: string | null
  selectedLayerId: string | null
  drawingTool: ShapeKind | null
  setDocument: (document: EditorDocument) => void
  resetDocument: () => void
  selectPage: (pageId: string) => void
  selectLayer: (layerId: string | null) => void
  setDrawingTool: (tool: ShapeKind | null) => void
  appendPages: (pages: EditorPage[]) => void
  addBlankPage: () => void
  deletePage: (pageId: string) => void
  duplicatePage: (pageId: string) => void
  rotatePage: (pageId: string) => void
  movePage: (pageId: string, targetId: string) => void
  addLayer: (pageId: string, layer: EditorLayer) => void
  updateLayer: (
    pageId: string,
    layerId: string,
    patch: Partial<ImageLayer> | Partial<TextLayer> | Partial<ShapeLayer>
  ) => void
  deleteLayer: (pageId: string, layerId: string) => void
  duplicateLayer: (pageId: string, layerId: string) => void
  moveLayer: (pageId: string, layerId: string, targetId: string) => void
}

type HistorySlice = Pick<EditorState, "document">

export const useEditorStore = create<EditorState>()(
  temporal(
    immer((set) => ({
      document: null,
      selectedPageId: null,
      selectedLayerId: null,
      drawingTool: null,
      setDocument: (document) =>
        set((state) => {
          state.document = document
          state.selectedPageId = document.pages[0]?.id ?? null
          state.selectedLayerId = null
          state.drawingTool = null
        }),
      resetDocument: () =>
        set((state) => {
          state.document = null
          state.selectedPageId = null
          state.selectedLayerId = null
          state.drawingTool = null
        }),
      selectPage: (pageId) =>
        set((state) => {
          state.selectedPageId = pageId
          state.selectedLayerId = null
        }),
      selectLayer: (layerId) =>
        set((state) => {
          state.selectedLayerId = layerId
        }),
      setDrawingTool: (tool) =>
        set((state) => {
          state.drawingTool = tool
        }),
      appendPages: (pages) =>
        set((state) => {
          if (!state.document) {
            state.document = {
              id: crypto.randomUUID(),
              name: "Untitled",
              pages,
            }
          } else {
            state.document.pages.push(...pages)
          }
          state.selectedPageId = pages[0]?.id ?? state.selectedPageId
          state.selectedLayerId = null
        }),
      addBlankPage: () =>
        set((state) => {
          if (!state.document) {
            const page = createBlankPage(1)
            state.document = {
              id: crypto.randomUUID(),
              name: "Untitled",
              pages: [page],
            }
            state.selectedPageId = page.id
            return
          }

          const currentIndex = Math.max(
            0,
            state.document.pages.findIndex(
              (page) => page.id === state.selectedPageId
            )
          )
          const page = createBlankPage(state.document.pages.length + 1)
          state.document.pages.splice(currentIndex + 1, 0, page)
          state.selectedPageId = page.id
          state.selectedLayerId = null
        }),
      deletePage: (pageId) =>
        set((state) => {
          if (!state.document) return
          const index = state.document.pages.findIndex(
            (page) => page.id === pageId
          )
          if (index < 0) return
          state.document.pages.splice(index, 1)
          const nextPage =
            state.document.pages[Math.min(index, state.document.pages.length - 1)]
          state.selectedPageId = nextPage?.id ?? null
          state.selectedLayerId = null
        }),
      duplicatePage: (pageId) =>
        set((state) => {
          if (!state.document) return
          const index = state.document.pages.findIndex(
            (page) => page.id === pageId
          )
          if (index < 0) return
          const source = state.document.pages[index]
          const duplicate: EditorPage = {
            ...source,
            id: crypto.randomUUID(),
            name: `${source.name} copy`,
            background: { ...source.background },
            layers: source.layers.map((layer) => ({
              ...layer,
              ...(layer.type === "shape" ? { points: [...layer.points] } : {}),
              id: crypto.randomUUID(),
            })),
          }
          state.document.pages.splice(index + 1, 0, duplicate)
          state.selectedPageId = duplicate.id
          state.selectedLayerId = null
        }),
      rotatePage: (pageId) =>
        set((state) => {
          const page = state.document?.pages.find((item) => item.id === pageId)
          if (!page) return
          page.rotation = ((page.rotation + 90) % 360) as EditorPage["rotation"]
          const width = page.widthPt
          page.widthPt = page.heightPt
          page.heightPt = width
        }),
      movePage: (pageId, targetId) =>
        set((state) => {
          if (!state.document || pageId === targetId) return
          const from = state.document.pages.findIndex((page) => page.id === pageId)
          const to = state.document.pages.findIndex((page) => page.id === targetId)
          if (from < 0 || to < 0) return
          const [page] = state.document.pages.splice(from, 1)
          state.document.pages.splice(to, 0, page)
        }),
      addLayer: (pageId, layer) =>
        set((state) => {
          const page = state.document?.pages.find((item) => item.id === pageId)
          if (!page) return
          if (layer.type === "text") {
            Object.assign(layer, measureTextLayer(layer))
          }
          page.layers.push(layer)
          state.selectedLayerId = layer.id
        }),
      updateLayer: (pageId, layerId, patch) =>
        set((state) => {
          const layer = state.document?.pages
            .find((page) => page.id === pageId)
            ?.layers.find((item) => item.id === layerId)
          if (!layer) return
          Object.assign(layer, patch)
          if (layer.type === "text") {
            Object.assign(layer, measureTextLayer(layer))
          }
        }),
      deleteLayer: (pageId, layerId) =>
        set((state) => {
          const page = state.document?.pages.find((item) => item.id === pageId)
          if (!page) return
          page.layers = page.layers.filter((layer) => layer.id !== layerId)
          if (state.selectedLayerId === layerId) state.selectedLayerId = null
        }),
      duplicateLayer: (pageId, layerId) =>
        set((state) => {
          const page = state.document?.pages.find((item) => item.id === pageId)
          const layer = page?.layers.find((item) => item.id === layerId)
          if (!page || !layer) return
          const duplicate = cloneLayer(layer)
          page.layers.push(duplicate)
          state.selectedLayerId = duplicate.id
        }),
      moveLayer: (pageId, layerId, targetId) =>
        set((state) => {
          const page = state.document?.pages.find((item) => item.id === pageId)
          if (!page || layerId === targetId) return
          const from = page.layers.findIndex((layer) => layer.id === layerId)
          const to = page.layers.findIndex((layer) => layer.id === targetId)
          if (from < 0 || to < 0) return
          const [layer] = page.layers.splice(from, 1)
          page.layers.splice(to, 0, layer)
        }),
    })),
    {
      limit: 80,
      partialize: (state): HistorySlice => ({ document: state.document }),
    }
  )
)

export function clearEditorHistory() {
  useEditorStore.temporal.getState().clear()
}
