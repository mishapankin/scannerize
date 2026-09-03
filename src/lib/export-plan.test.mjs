import assert from "node:assert/strict"
import test from "node:test"

import {
  buildExportPlan,
  canPreserveOriginalPage,
  getDominantPageSize,
} from "./export-plan.ts"

function page(id, widthPt, heightPt, overrides = {}) {
  return {
    id,
    name: id,
    widthPt,
    heightPt,
    rotation: 0,
    background: { type: "pdf", sourceId: "source", pageNumber: 1 },
    layers: [],
    ...overrides,
  }
}

const settings = {
  dpi: 150,
  preserveUntouched: true,
  pageSizeMode: "limit-oversized",
  pageSizeTarget: "auto",
  currentPageId: null,
  customWidthMm: 210,
  customHeightMm: 297,
}

test("dominant size ignores a giant outlier and page orientation", () => {
  const size = getDominantPageSize([
    page("a", 595, 842),
    page("b", 842, 595),
    page("c", 1190, 1684),
  ])

  assert.equal(size.widthPt, 595)
  assert.equal(size.heightPt, 842)
})

test("limit oversized changes only the outlier", () => {
  const plan = buildExportPlan(
    [page("a", 595, 842), page("b", 595, 842), page("c", 1190, 1684)],
    settings
  )

  assert.equal(plan.resizedCount, 1)
  assert.equal(plan.preservedCount, 2)
  assert.deepEqual(
    plan.pages.map(({ widthPt, heightPt }) => [widthPt, heightPt]),
    [
      [595, 842],
      [595, 842],
      [595, 842],
    ]
  )
})

test("uniform sizing follows each page orientation", () => {
  const plan = buildExportPlan(
    [page("portrait", 500, 700), page("landscape", 700, 500)],
    { ...settings, pageSizeMode: "uniform", pageSizeTarget: "a4" }
  )

  assert.deepEqual(
    plan.pages.map(({ widthPt, heightPt }) => [widthPt, heightPt]),
    [
      [595.28, 841.89],
      [841.89, 595.28],
    ]
  )
})

test("only visible page content prevents direct preservation", () => {
  const hiddenText = {
    id: "text",
    type: "text",
    name: "Text",
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    rotation: 0,
    opacity: 1,
    visible: false,
    locked: false,
    value: "Hidden",
    resizeMode: "auto-width",
    fontFamily: "Manrope Variable",
    fontSize: 12,
    fontWeight: 400,
    fill: "#000000",
    align: "left",
    lineHeight: 1.2,
  }

  assert.equal(
    canPreserveOriginalPage(page("hidden", 595, 842, { layers: [hiddenText] })),
    true
  )
  assert.equal(
    canPreserveOriginalPage(
      page("visible", 595, 842, {
        layers: [{ ...hiddenText, id: "visible", visible: true }],
      })
    ),
    false
  )

  const visibleShape = {
    id: "shape",
    type: "shape",
    shape: "rectangle",
    name: "Rectangle",
    x: 20,
    y: 20,
    width: 100,
    height: 80,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    points: [],
    fill: null,
    stroke: "#000000",
    strokeWidth: 1,
  }

  assert.equal(
    canPreserveOriginalPage(
      page("shape", 595, 842, { layers: [visibleShape] })
    ),
    false
  )

  assert.equal(
    canPreserveOriginalPage(
      page("disabled-shape", 595, 842, {
        layers: [
          {
            ...visibleShape,
            id: "disabled-shape",
            fill: "#FFFFFF",
            fillEnabled: false,
            strokeEnabled: false,
          },
        ],
      })
    ),
    true
  )

  assert.equal(
    canPreserveOriginalPage(
      page("brush", 595, 842, {
        layers: [
          {
            id: "brush",
            type: "brush",
            name: "Brush",
            x: 10,
            y: 10,
            width: 50,
            height: 50,
            rotation: 0,
            opacity: 1,
            visible: true,
            locked: false,
            points: [0.1, 0.1, 0.9, 0.9],
            color: "#000000",
            strokeWidth: 6,
          },
        ],
      })
    ),
    false
  )
})
