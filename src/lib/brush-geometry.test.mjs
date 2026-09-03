import assert from "node:assert/strict"
import test from "node:test"

import {
  appendBrushPoint,
  getBrushGeometry,
  getScaledBrushPoints,
} from "./brush-geometry.ts"

test("brush geometry includes half-width padding around its path", () => {
  const geometry = getBrushGeometry(
    [
      { x: 10, y: 20 },
      { x: 50, y: 60 },
    ],
    8
  )

  assert.deepEqual(geometry, {
    x: 6,
    y: 16,
    width: 48,
    height: 48,
    points: [4 / 48, 4 / 48, 44 / 48, 44 / 48],
  })
  assert.deepEqual(getScaledBrushPoints(geometry), [4, 4, 44, 44])
})

test("brush sampling ignores points that are too close together", () => {
  const points = [{ x: 10, y: 10 }]
  assert.equal(appendBrushPoint(points, { x: 10.2, y: 10.2 }, 1), points)
  assert.deepEqual(appendBrushPoint(points, { x: 12, y: 10 }, 1), [
    { x: 10, y: 10 },
    { x: 12, y: 10 },
  ])
})
