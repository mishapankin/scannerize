import type { TextLayer, TextResizeMode } from "@/types/editor"

const MIN_TEXT_SIZE = 12
let measurementContext: CanvasRenderingContext2D | null = null

function getMeasurementContext() {
  if (measurementContext) return measurementContext
  if (typeof document === "undefined") return null

  measurementContext = document.createElement("canvas").getContext("2d")
  return measurementContext
}

function configureFont(
  context: CanvasRenderingContext2D,
  layer: Pick<TextLayer, "fontFamily" | "fontSize" | "fontWeight">
) {
  context.font = `${layer.fontWeight} ${layer.fontSize}px "${layer.fontFamily}"`
}

function splitTokenToWidth(
  context: CanvasRenderingContext2D,
  token: string,
  maxWidth: number
) {
  const parts: string[] = []
  let part = ""

  for (const character of token) {
    const candidate = part + character
    if (part && context.measureText(candidate).width > maxWidth) {
      parts.push(part)
      part = character
    } else {
      part = candidate
    }
  }

  if (part) parts.push(part)
  return parts
}

export function getTextResizeMode(
  layer: Pick<TextLayer, "resizeMode">
): TextResizeMode {
  return layer.resizeMode ?? "fixed"
}

export function getTextLines(
  context: CanvasRenderingContext2D,
  layer: Pick<
    TextLayer,
    | "value"
    | "width"
    | "resizeMode"
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
  >
) {
  configureFont(context, layer)

  if (getTextResizeMode(layer) === "auto-width") {
    return layer.value.split("\n")
  }

  const maxWidth = Math.max(MIN_TEXT_SIZE, layer.width)
  const lines: string[] = []

  for (const paragraph of layer.value.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push("")
      continue
    }

    let line = ""
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate
        continue
      }

      if (line) lines.push(line)
      if (context.measureText(word).width <= maxWidth) {
        line = word
        continue
      }

      const pieces = splitTokenToWidth(context, word, maxWidth)
      lines.push(...pieces.slice(0, -1))
      line = pieces.at(-1) ?? ""
    }
    lines.push(line)
  }

  return lines
}

export function measureTextLayer(layer: TextLayer) {
  const mode = getTextResizeMode(layer)
  if (mode === "fixed") {
    return { width: layer.width, height: layer.height }
  }

  const context = getMeasurementContext()
  if (!context) return { width: layer.width, height: layer.height }

  configureFont(context, layer)
  const lines = getTextLines(context, layer)
  const height = Math.max(
    MIN_TEXT_SIZE,
    lines.length * layer.fontSize * layer.lineHeight
  )

  if (mode === "auto-height") return { width: layer.width, height }

  const width = Math.max(
    MIN_TEXT_SIZE,
    ...lines.map((line) => context.measureText(line).width)
  )
  return { width, height }
}
