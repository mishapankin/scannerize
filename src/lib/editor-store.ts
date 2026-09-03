"use client"

import { temporal } from "zundo"
import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

import { measureTextLayer } from "@/lib/text-layout"
import type {
  BrushLayer,
  DrawingTool,
  EditorDocument,
  EditorLayer,
  EditorPage,
  ImageLayer,
  ShapeKind,
  ShapeLayer,
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
    ...(layer.type === "shape" || layer.type === "brush"
      ? { points: [...layer.points] }
      : {}),
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
  renamingLayerId: string | null
  drawingTool: DrawingTool | null
  drawingGestureActive: boolean
  brushColor: string
  brushWidth: number
  shapeKind: ShapeKind
  shapeFill: string
  shapeFillEnabled: boolean
  shapeStroke: string
  shapeStrokeEnabled: boolean
  shapeStrokeWidth: number
  setDocument: (document: EditorDocument) => void
  resetDocument: () => void
  selectPage: (pageId: string) => void
  selectLayer: (layerId: string | null) => void
  setRenamingLayer: (layerId: string | null) => void
  setDrawingTool: (tool: DrawingTool | null) => void
  setDrawingGestureActive: (active: boolean) => void
  setBrushColor: (color: string) => void
  setBrushWidth: (width: number) => void
  setShapeKind: (shape: ShapeKind) => void
  setShapeFill: (color: string) => void
  setShapeFillEnabled: (enabled: boolean) => void
  setShapeStroke: (color: string) => void
  setShapeStrokeEnabled: (enabled: boolean) => void
  setShapeStrokeWidth: (width: number) => void
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
    patch:
      | Partial<ImageLayer>
      | Partial<TextLayer>
      | Partial<ShapeLayer>
      | Partial<BrushLayer>
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
      renamingLayerId: null,
      drawingTool: null,
      drawingGestureActive: false,
      brushColor: "#26241F",
      brushWidth: 6,
      shapeKind: "rectangle",
      shapeFill: "#FFFFFF",
      shapeFillEnabled: false,
      shapeStroke: "#26241F",
      shapeStrokeEnabled: true,
      shapeStrokeWidth: 1.5,
      setDocument: (document) =>
        set((state) => {
          state.document = document
          state.selectedPageId = document.pages[0]?.id ?? null
          state.selectedLayerId = null
          state.renamingLayerId = null
          state.drawingTool = null
          state.drawingGestureActive = false
        }),
      resetDocument: () =>
        set((state) => {
          state.document = null
          state.selectedPageId = null
          state.selectedLayerId = null
          state.renamingLayerId = null
          state.drawingTool = null
          state.drawingGestureActive = false
        }),
      selectPage: (pageId) =>
        set((state) => {
          state.selectedPageId = pageId
          state.selectedLayerId = null
          state.renamingLayerId = null
          state.drawingGestureActive = false
        }),
      selectLayer: (layerId) =>
        set((state) => {
          state.selectedLayerId = layerId
        }),
      setRenamingLayer: (layerId) =>
        set((state) => {
          state.renamingLayerId = layerId
        }),
      setDrawingTool: (tool) =>
        set((state) => {
          state.drawingTool = tool
          state.drawingGestureActive = false
        }),
      setDrawingGestureActive: (active) =>
        set((state) => {
          state.drawingGestureActive = active
        }),
      setBrushColor: (color) =>
        set((state) => {
          state.brushColor = color
        }),
      setBrushWidth: (width) =>
        set((state) => {
          if (!Number.isFinite(width)) return
          state.brushWidth = Math.min(144, Math.max(0.5, width))
        }),
      setShapeKind: (shape) =>
        set((state) => {
          state.shapeKind = shape
        }),
      setShapeFill: (color) =>
        set((state) => {
          state.shapeFill = color
        }),
      setShapeFillEnabled: (enabled) =>
        set((state) => {
          state.shapeFillEnabled = enabled
        }),
      setShapeStroke: (color) =>
        set((state) => {
          state.shapeStroke = color
        }),
      setShapeStrokeEnabled: (enabled) =>
        set((state) => {
          state.shapeStrokeEnabled = enabled
        }),
      setShapeStrokeWidth: (width) =>
        set((state) => {
          if (!Number.isFinite(width)) return
          state.shapeStrokeWidth = Math.min(72, Math.max(0.25, width))
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
              ...(layer.type === "shape" || layer.type === "brush"
                ? { points: [...layer.points] }
                : {}),
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
          if (state.renamingLayerId === layerId) state.renamingLayerId = null
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
      equality: (past, current) => past.document === current.document,
    }
  )
)

export function clearEditorHistory() {
  useEditorStore.temporal.getState().clear()
}
