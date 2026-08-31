type ImageAsset = {
  id: string
  name: string
  blob: Blob
  url: string
  image: HTMLImageElement
  width: number
  height: number
}

export type PersistedImageAsset = Pick<ImageAsset, "id" | "name" | "blob">

const imageAssets = new Map<string, ImageAsset>()

async function registerImageBlob(
  blob: Blob,
  name: string,
  id: string
): Promise<ImageAsset> {
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = "async"
  image.src = url

  try {
    await image.decode()
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }

  const asset = {
    id,
    name,
    blob,
    url,
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
  }

  const previous = imageAssets.get(id)
  if (previous) URL.revokeObjectURL(previous.url)
  imageAssets.set(id, asset)
  return asset
}

export async function registerImage(file: File): Promise<ImageAsset> {
  return registerImageBlob(file, file.name, crypto.randomUUID())
}

export async function restoreImageAsset(asset: PersistedImageAsset) {
  return registerImageBlob(asset.blob, asset.name, asset.id)
}

export function getImageAsset(id: string) {
  return imageAssets.get(id)
}

export function getPersistedImageAsset(id: string): PersistedImageAsset | null {
  const asset = imageAssets.get(id)
  if (!asset) return null
  return { id: asset.id, name: asset.name, blob: asset.blob }
}

export function retainImageAssets(ids: ReadonlySet<string>) {
  for (const [id, asset] of imageAssets) {
    if (ids.has(id)) continue
    URL.revokeObjectURL(asset.url)
    imageAssets.delete(id)
  }
}

export function clearImageAssets() {
  for (const asset of imageAssets.values()) {
    URL.revokeObjectURL(asset.url)
  }
  imageAssets.clear()
}
