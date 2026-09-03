import assert from "node:assert/strict"
import test from "node:test"

import { getLayerOrderTargetId } from "./layer-order.ts"

const layers = ["back", "middle", "front"]

test("layer order resolves adjacent targets", () => {
  assert.equal(getLayerOrderTargetId(layers, "middle", 1), "front")
  assert.equal(getLayerOrderTargetId(layers, "middle", -1), "back")
})

test("layer order resolves stack-edge targets", () => {
  assert.equal(getLayerOrderTargetId(layers, "middle", "front"), "front")
  assert.equal(getLayerOrderTargetId(layers, "middle", "back"), "back")
})

test("layer order disables moves that cannot change the stack", () => {
  assert.equal(getLayerOrderTargetId(layers, "front", 1), null)
  assert.equal(getLayerOrderTargetId(layers, "front", "front"), null)
  assert.equal(getLayerOrderTargetId(layers, "back", -1), null)
  assert.equal(getLayerOrderTargetId(layers, "back", "back"), null)
})
