export type PageBackground =
  | {
      type: "pdf"
      sourceId: string
      pageNumber: number
    }
  | {
      type: "blank"
      color: string
    }

type LayerBase = {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
}

export type ImageLayer = LayerBase & {
  type: "image"
  assetId: string
}

export type TextResizeMode = "auto-width" | "auto-height" | "fixed"

export type TextLayer = LayerBase & {
  type: "text"
  value: string
  resizeMode: TextResizeMode
  fontFamily: "Manrope Variable" | "Source Serif 4 Variable"
  fontSize: number
  fontWeight: number
  fill: string
  align: "left" | "center" | "right"
  lineHeight: number
}

export type EditorLayer = ImageLayer | TextLayer

export type EditorPage = {
  id: string
  name: string
  widthPt: number
  heightPt: number
  rotation: 0 | 90 | 180 | 270
  background: PageBackground
  layers: EditorLayer[]
}

export type EditorDocument = {
  id: string
  name: string
  pages: EditorPage[]
}

export type ImportProgress = {
  current: number
  total: number
  label: string
}

export type ExportProgress = ImportProgress & {
  dpi: number
}
