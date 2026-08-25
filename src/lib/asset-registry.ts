type ImageAsset = {
  id: string
  name: string
  url: string
  image: HTMLImageElement
  width: number
  height: number
}

const imageAssets = new Map<string, ImageAsset>()

export async function registerImage(file: File): Promise<ImageAsset> {
  const id = crypto.randomUUID()
  const url = URL.createObjectURL(file)
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
    name: file.name,
    url,
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
  }

  imageAssets.set(id, asset)
  return asset
}

export function getImageAsset(id: string) {
  return imageAssets.get(id)
}

export function clearImageAssets() {
  for (const asset of imageAssets.values()) {
    URL.revokeObjectURL(asset.url)
  }
  imageAssets.clear()
}
