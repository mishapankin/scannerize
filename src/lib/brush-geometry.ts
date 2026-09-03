import type { BrushLayer } from "@/types/editor"

export type BrushPoint = { x: number; y: number }

export type BrushGeometry = Pick<
  BrushLayer,
  "x" | "y" | "width" | "height" | "points"
>

export function appendBrushPoint(
  points: BrushPoint[],
  point: BrushPoint,
  minimumDistance: number
) {
  const previous = points.at(-1)
  if (
    previous &&
    Math.hypot(point.x - previous.x, point.y - previous.y) < minimumDistance
  ) {
    return points
  }
  return [...points, point]
}

export function getBrushGeometry(
  points: BrushPoint[],
  strokeWidth: number
): BrushGeometry | null {
  if (points.length === 0) return null

  const padding = strokeWidth / 2
  const xValues = points.map((point) => point.x)
  const yValues = points.map((point) => point.y)
  const x = Math.min(...xValues) - padding
  const y = Math.min(...yValues) - padding
  const width = Math.max(
    1,
    Math.max(...xValues) - Math.min(...xValues) + strokeWidth
  )
  const height = Math.max(
    1,
    Math.max(...yValues) - Math.min(...yValues) + strokeWidth
  )

  return {
    x,
    y,
    width,
    height,
    points: points.flatMap((point) => [
      (point.x - x) / width,
      (point.y - y) / height,
    ]),
  }
}

export function getScaledBrushPoints(
  layer: Pick<BrushLayer, "points" | "width" | "height">
) {
  const points: number[] = []
  for (let index = 0; index < layer.points.length; index += 2) {
    points.push(layer.points[index] * layer.width)
    points.push(layer.points[index + 1] * layer.height)
  }
  return points
}
