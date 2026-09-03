import type { ShapeKind, ShapeLayer } from "@/types/editor"

export type ShapePoint = { x: number; y: number }

export type ShapeGeometry = Pick<ShapeLayer, "x" | "y" | "width" | "height" | "points">

const MIN_SHAPE_SIZE = 1

export function getShapeName(shape: ShapeKind) {
  switch (shape) {
    case "rectangle":
      return "Rectangle"
    case "ellipse":
      return "Ellipse"
    case "line":
      return "Line"
    case "arrow":
      return "Arrow"
    case "polygon":
      return "Polygon"
  }
}

function constrainEndpoint(start: ShapePoint, end: ShapePoint, shape: ShapeKind) {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y

  if (shape === "rectangle" || shape === "ellipse") {
    const size = Math.max(Math.abs(deltaX), Math.abs(deltaY))
    return {
      x: start.x + Math.sign(deltaX || 1) * size,
      y: start.y + Math.sign(deltaY || 1) * size,
    }
  }

  const distance = Math.hypot(deltaX, deltaY)
  const angle = Math.round(Math.atan2(deltaY, deltaX) / (Math.PI / 4)) * (Math.PI / 4)
  return {
    x: start.x + Math.cos(angle) * distance,
    y: start.y + Math.sin(angle) * distance,
  }
}

export function getDraggedShapeGeometry(
  shape: Exclude<ShapeKind, "polygon">,
  start: ShapePoint,
  pointer: ShapePoint,
  options: { constrain?: boolean; fromCenter?: boolean } = {}
): ShapeGeometry {
  const end = options.constrain
    ? constrainEndpoint(start, pointer, shape)
    : pointer
  const startX = options.fromCenter ? start.x - (end.x - start.x) : start.x
  const startY = options.fromCenter ? start.y - (end.y - start.y) : start.y
  const endX = end.x
  const endY = end.y
  const x = Math.min(startX, endX)
  const y = Math.min(startY, endY)
  const width = Math.max(MIN_SHAPE_SIZE, Math.abs(endX - startX))
  const height = Math.max(MIN_SHAPE_SIZE, Math.abs(endY - startY))
  const isLine = shape === "line" || shape === "arrow"

  return {
    x,
    y,
    width,
    height,
    points: isLine
      ? [
          startX <= endX ? 0 : 1,
          startY <= endY ? 0 : 1,
          startX <= endX ? 1 : 0,
          startY <= endY ? 1 : 0,
        ]
      : [],
  }
}

export function getPolygonGeometry(points: ShapePoint[]): ShapeGeometry | null {
  if (points.length < 3) return null
  const xValues = points.map((point) => point.x)
  const yValues = points.map((point) => point.y)
  const x = Math.min(...xValues)
  const y = Math.min(...yValues)
  const width = Math.max(MIN_SHAPE_SIZE, Math.max(...xValues) - x)
  const height = Math.max(MIN_SHAPE_SIZE, Math.max(...yValues) - y)

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

export function getScaledShapePoints(layer: Pick<ShapeLayer, "points" | "width" | "height">) {
  const points: number[] = []
  for (let index = 0; index < layer.points.length; index += 2) {
    points.push(layer.points[index] * layer.width)
    points.push(layer.points[index + 1] * layer.height)
  }
  return points
}

export function isShapeFillEnabled(
  layer: Pick<ShapeLayer, "fill" | "fillEnabled">
) {
  return layer.fillEnabled ?? Boolean(layer.fill)
}

export function isShapeStrokeEnabled(
  layer: Pick<ShapeLayer, "stroke" | "strokeEnabled">
) {
  return layer.strokeEnabled ?? Boolean(layer.stroke)
}
