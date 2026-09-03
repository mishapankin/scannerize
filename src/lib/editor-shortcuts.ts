import {
  detectPlatform,
  formatForDisplay,
  type RegisterableHotkey,
} from "@tanstack/react-hotkeys"

export const EDITOR_SHORTCUTS = {
  openPdf: "Mod+O",
  appendPdf: "Mod+Shift+O",
  exportPdf: "Mod+Alt+E",
  saveDocument: "Mod+S",
  undo: "Mod+Z",
  redo: "Mod+Shift+Z",
  deleteLayer: "Backspace",
  deleteLayerForward: "Delete",
  deletePage: "Shift+Backspace",
  deletePageForward: "Shift+Delete",
  duplicateLayer: "Mod+J",
  duplicatePage: "Mod+Shift+J",
  renameLayer: "F2",
  selectLayerAbove: "Alt+]",
  selectLayerBelow: "Alt+[",
  moveLayerForward: "Mod+]",
  moveLayerBackward: "Mod+[",
  moveLayerToFront: { key: "]", mod: true, shift: true },
  moveLayerToBack: { key: "[", mod: true, shift: true },
  toggleLayerVisibility: "Mod+,",
  toggleLayerLock: "Mod+/",
  copyLayer: "Mod+C",
  cutLayer: "Mod+X",
  pasteLayer: "Mod+V",
  deselectLayer: "Escape",
  previousPage: "PageUp",
  nextPage: "PageDown",
  movePageEarlier: "Shift+PageUp",
  movePageLater: "Shift+PageDown",
  addBlankPage: "Mod+Enter",
  rotatePage: "Shift+R",
  selectTool: "V",
  panTool: "H",
  zoomTool: "Z",
  textTool: "T",
  brushTool: "B",
  decreaseBrushSize: "[",
  increaseBrushSize: "]",
  shapeTool: "U",
  cycleShapeTool: "Shift+U",
  swapShapePaint: "X",
  resetShapePaint: "D",
  zoomIn: "Mod+=",
  zoomOut: "Mod+-",
  fitPage: "Mod+0",
  actualSize: "Mod+1",
} as const satisfies Record<string, RegisterableHotkey>

type ShortcutPlatform = "mac" | "windows" | "linux"

export function formatEditorShortcut(
  shortcut: RegisterableHotkey,
  platform?: ShortcutPlatform
) {
  return formatForDisplay(shortcut, platform ? { platform } : undefined)
}

export function formatDeleteShortcut(
  target: "layer" | "page",
  platform?: ShortcutPlatform
) {
  const resolvedPlatform = platform ?? detectPlatform()
  if (resolvedPlatform !== "mac") {
    return target === "page" ? "Shift+Del" : "Del"
  }
  return formatEditorShortcut(
    target === "page"
      ? EDITOR_SHORTCUTS.deletePage
      : EDITOR_SHORTCUTS.deleteLayer,
    resolvedPlatform
  )
}
