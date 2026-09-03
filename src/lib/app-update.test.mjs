import assert from "node:assert/strict"
import test from "node:test"

import {
  hasDeploymentUpdate,
  readDeploymentManifest,
} from "./app-update.ts"

test("deployment manifests require a version and build time", () => {
  assert.deepEqual(
    readDeploymentManifest({ version: "abc123", builtAt: "2026-09-03T12:00:00Z" }),
    { version: "abc123", builtAt: "2026-09-03T12:00:00Z" }
  )
  assert.equal(readDeploymentManifest({ version: "abc123" }), null)
  assert.equal(readDeploymentManifest(null), null)
})

test("deployment versions identify newer static builds", () => {
  const manifest = {
    version: "next-build",
    builtAt: "2026-09-03T12:00:00Z",
  }
  assert.equal(hasDeploymentUpdate("current-build", manifest), true)
  assert.equal(hasDeploymentUpdate("next-build", manifest), false)
})
