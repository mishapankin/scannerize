import assert from "node:assert/strict"
import test from "node:test"

import {
  getDraggedShapeGeometry,
  getPolygonGeometry,
  getScaledShapePoints,
  isShapeFillEnabled,
  isShapeStrokeEnabled,
} from "./shape-geometry.ts"

test("constrained rectangles remain square in every drag direction", () => {
  assert.deepEqual(
    getDraggedShapeGeometry(
      "rectangle",
      { x: 100, y: 100 },
      { x: 60, y: 80 },
      { constrain: true }
    ),
    { x: 60, y: 60, width: 40, height: 40, points: [] }
  )
})

test("line direction survives normalized local geometry", () => {
  const geometry = getDraggedShapeGeometry(
    "line",
    { x: 80, y: 20 },
    { x: 20, y: 50 }
  )

  assert.deepEqual(geometry, {
    x: 20,
    y: 20,
    width: 60,
    height: 30,
    points: [1, 0, 0, 1],
  })
  assert.deepEqual(getScaledShapePoints(geometry), [60, 0, 0, 30])
})

test("polygon points normalize against their bounds", () => {
  const geometry = getPolygonGeometry([
    { x: 10, y: 20 },
    { x: 50, y: 20 },
    { x: 30, y: 60 },
  ])

  assert.deepEqual(geometry, {
    x: 10,
    y: 20,
    width: 40,
    height: 40,
    points: [0, 0, 1, 0, 0.5, 1],
  })
})

test("paint values remain stored independently from their enabled state", () => {
  const shape = {
    fill: "#F4A261",
    fillEnabled: false,
    stroke: "#264653",
    strokeEnabled: false,
  }

  assert.equal(isShapeFillEnabled(shape), false)
  assert.equal(isShapeStrokeEnabled(shape), false)
  assert.equal(shape.fill, "#F4A261")
  assert.equal(shape.stroke, "#264653")

  assert.equal(isShapeFillEnabled({ fill: "#F4A261" }), true)
  assert.equal(isShapeStrokeEnabled({ stroke: null }), false)
})
