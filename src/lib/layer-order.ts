export type LayerOrderDirection = -1 | 1 | "front" | "back"

export function getLayerOrderTargetId(
  layerIds: string[],
  layerId: string,
  direction: LayerOrderDirection
) {
  const currentIndex = layerIds.indexOf(layerId)
  if (currentIndex < 0) return null

  const targetIndex =
    direction === "front"
      ? layerIds.length - 1
      : direction === "back"
        ? 0
        : Math.min(
            layerIds.length - 1,
            Math.max(0, currentIndex + direction)
          )

  return targetIndex === currentIndex ? null : (layerIds[targetIndex] ?? null)
}
