import assert from "node:assert/strict"
import test from "node:test"

import {
  EDITOR_SHORTCUTS,
  formatEditorShortcut,
} from "./editor-shortcuts.ts"

test("shortcut labels adapt to the operating system", () => {
  assert.equal(
    formatEditorShortcut(EDITOR_SHORTCUTS.appendPdf, "mac"),
    "⌘ ⌥ ⇧ O"
  )
  assert.equal(
    formatEditorShortcut(EDITOR_SHORTCUTS.appendPdf, "windows"),
    "Ctrl+Alt+Shift+O"
  )
  assert.equal(
    formatEditorShortcut(EDITOR_SHORTCUTS.appendPdf, "linux"),
    "Ctrl+Alt+Shift+O"
  )
})

test("editing shortcuts keep conventional cross-platform bindings", () => {
  assert.equal(formatEditorShortcut(EDITOR_SHORTCUTS.undo, "mac"), "⌘ Z")
  assert.equal(
    formatEditorShortcut(EDITOR_SHORTCUTS.redo, "windows"),
    "Ctrl+Shift+Z"
  )
})

test("tool shortcuts display consistently on every platform", () => {
  assert.equal(formatEditorShortcut(EDITOR_SHORTCUTS.shapeTool, "mac"), "U")
  assert.equal(
    formatEditorShortcut(EDITOR_SHORTCUTS.cycleShapeTool, "windows"),
    "Shift+U"
  )
  assert.equal(
    formatEditorShortcut(EDITOR_SHORTCUTS.cycleShapeTool, "linux"),
    "Shift+U"
  )
  assert.equal(formatEditorShortcut(EDITOR_SHORTCUTS.brushTool, "mac"), "B")
})
