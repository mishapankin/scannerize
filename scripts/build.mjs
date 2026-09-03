import { randomUUID } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"

const version =
  process.env.NEXT_PUBLIC_BUILD_ID || process.env.GITHUB_SHA || randomUUID()
const builtAt = new Date().toISOString()
const environment = {
  ...process.env,
  NEXT_PUBLIC_BUILD_ID: version,
}

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    env: environment,
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run("node_modules/next/dist/bin/next", ["build", "--webpack"])
await writeFile(
  "out/version.json",
  `${JSON.stringify({ version, builtAt })}\n`,
  "utf8"
)
run("scripts/generate-sw.mjs")
