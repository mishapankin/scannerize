export type DeploymentManifest = {
  version: string
  builtAt: string
}

export function readDeploymentManifest(value: unknown): DeploymentManifest | null {
  if (!value || typeof value !== "object") return null
  const manifest = value as Partial<DeploymentManifest>
  if (
    typeof manifest.version !== "string" ||
    !manifest.version.trim() ||
    typeof manifest.builtAt !== "string" ||
    !manifest.builtAt.trim()
  ) {
    return null
  }
  return {
    version: manifest.version,
    builtAt: manifest.builtAt,
  }
}

export function hasDeploymentUpdate(
  currentVersion: string,
  manifest: DeploymentManifest
) {
  return Boolean(currentVersion) && manifest.version !== currentVersion
}
