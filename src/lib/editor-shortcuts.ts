import { formatForDisplay, type Hotkey } from "@tanstack/react-hotkeys"

export const EDITOR_SHORTCUTS = {
  openPdf: "Mod+Alt+O",
  appendPdf: "Mod+Alt+Shift+O",
  exportPdf: "Mod+Alt+E",
  undo: "Mod+Z",
  redo: "Mod+Shift+Z",
  selectTool: "V",
  panTool: "H",
  zoomTool: "Z",
  brushTool: "B",
  shapeTool: "U",
  cycleShapeTool: "Shift+U",
} as const satisfies Record<string, Hotkey>

type ShortcutPlatform = "mac" | "windows" | "linux"

export function formatEditorShortcut(
  shortcut: Hotkey,
  platform?: ShortcutPlatform
) {
  return formatForDisplay(shortcut, platform ? { platform } : undefined)
}
