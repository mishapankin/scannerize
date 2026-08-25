"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Konva from "konva"
import {
  Image as KonvaImage,
  Layer as KonvaLayer,
  Stage,
  Text as KonvaText,
  Transformer,
} from "react-konva"

import { getImageAsset } from "@/lib/asset-registry"
import { useEditorStore } from "@/lib/editor-store"
import { renderPageBackground } from "@/lib/pdf-engine"
import type { EditorLayer, EditorPage } from "@/types/editor"

type PageCanvasProps = {
  page: EditorPage
  width: number
  height: number
}

function useBackground(page: EditorPage, scale: number) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const { background, heightPt, rotation, widthPt } = page

  useEffect(() => {
    let cancelled = false
    let rendered: HTMLCanvasElement | null = null

    void renderPageBackground(
      {
        id: "preview",
        name: "Preview",
        background,
        heightPt,
        widthPt,
        rotation,
        layers: [],
      },
      scale
    )
      .then((nextCanvas) => {
        rendered = nextCanvas
        if (!cancelled) setCanvas(nextCanvas)
      })
      .catch(() => {
        if (!cancelled) setCanvas(null)
      })

    return () => {
      cancelled = true
      if (rendered) {
        rendered.width = 1
        rendered.height = 1
      }
    }
  }, [background, heightPt, rotation, scale, widthPt])

  return canvas
}

function CanvasLayerNode({
  layer,
  page,
  registerRef,
}: {
  layer: EditorLayer
  page: EditorPage
  registerRef: (id: string, node: Konva.Node | null) => void
}) {
  const updateLayer = useEditorStore((state) => state.updateLayer)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const common = {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked,
    onClick: (event: Konva.KonvaEventObject<MouseEvent>) => {
      event.cancelBubble = true
      selectLayer(layer.id)
    },
    onTap: (event: Konva.KonvaEventObject<TouchEvent>) => {
      event.cancelBubble = true
      selectLayer(layer.id)
    },
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      updateLayer(page.id, layer.id, {
        x: event.target.x(),
        y: event.target.y(),
      })
    },
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      node.scaleX(1)
      node.scaleY(1)
      updateLayer(page.id, layer.id, {
        x: node.x(),
        y: node.y(),
        width: Math.max(12, node.width() * scaleX),
        height: Math.max(12, node.height() * scaleY),
        rotation: node.rotation(),
      })
    },
  }

  if (layer.type === "image") {
    const asset = getImageAsset(layer.assetId)
    return (
      <KonvaImage
        {...common}
        image={asset?.image}
        ref={(node) => registerRef(layer.id, node)}
      />
    )
  }

  return (
    <KonvaText
      {...common}
      text={layer.value}
      fontFamily={layer.fontFamily}
      fontSize={layer.fontSize}
      fontStyle={layer.fontWeight >= 600 ? "bold" : "normal"}
      fill={layer.fill}
      align={layer.align}
      lineHeight={layer.lineHeight}
      wrap="word"
      verticalAlign="top"
      ref={(node) => registerRef(layer.id, node)}
    />
  )
}

export function PageCanvas({ page, width, height }: PageCanvasProps) {
  const zoom = useEditorStore((state) => state.zoom)
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId)
  const selectLayer = useEditorStore((state) => state.selectLayer)
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodeRefs = useRef(new Map<string, Konva.Node>())

  const fitScale = useMemo(
    () =>
      Math.max(
        0.05,
        Math.min((width - 72) / page.widthPt, (height - 72) / page.heightPt)
      ),
    [height, page.heightPt, page.widthPt, width]
  )
  const displayScale = fitScale * zoom
  const renderScale = Math.min(
    3,
    Math.max(0.5, displayScale * window.devicePixelRatio)
  )
  const background = useBackground(page, renderScale)

  useEffect(() => {
    const transformer = transformerRef.current
    const selectedNode = selectedLayerId
      ? nodeRefs.current.get(selectedLayerId)
      : undefined
    transformer?.nodes(selectedNode ? [selectedNode] : [])
    transformer?.getLayer()?.batchDraw()
  }, [page.layers, selectedLayerId])

  const selectedLayer = page.layers.find(
    (layer) => layer.id === selectedLayerId
  )

  return (
    <div
      className="paper-surface"
      style={{
        width: page.widthPt * displayScale,
        height: page.heightPt * displayScale,
      }}
    >
      <Stage
        width={page.widthPt * displayScale}
        height={page.heightPt * displayScale}
        scaleX={displayScale}
        scaleY={displayScale}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) selectLayer(null)
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) selectLayer(null)
        }}
      >
        <KonvaLayer listening={false}>
          <KonvaImage
            image={background ?? undefined}
            width={page.widthPt}
            height={page.heightPt}
          />
        </KonvaLayer>
        <KonvaLayer>
          {page.layers.map((layer) => (
            <CanvasLayerNode
              key={layer.id}
              layer={layer}
              page={page}
              registerRef={(id, node) => {
                if (node) nodeRefs.current.set(id, node)
                else nodeRefs.current.delete(id)
              }}
            />
          ))}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            keepRatio={selectedLayer?.type === "image"}
            flipEnabled={false}
            anchorFill="var(--paper)"
            anchorStroke="var(--primary)"
            borderStroke="var(--primary)"
            anchorSize={8 / displayScale}
            borderStrokeWidth={1 / displayScale}
            boundBoxFunc={(oldBox, nextBox) =>
              nextBox.width < 12 || nextBox.height < 12 ? oldBox : nextBox
            }
          />
        </KonvaLayer>
      </Stage>
    </div>
  )
}
