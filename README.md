# Scannerize

Scannerize is a browser-only editor for final-stage PDF changes. It imports local PDFs as page backgrounds, places editable image and text layers over them, manages pages in a filmstrip, and downloads a finished PDF. Document bytes never leave the browser.

## Features

- Import a PDF or drop it onto the editor; dropping another PDF appends its pages.
- Add, move, resize, rotate, reorder, hide, lock, duplicate, and delete image or text layers.
- Edit text content, font, size, weight, alignment, color, opacity, line height,
  and Figma-style auto-width, auto-height, or fixed-size frames.
- Add blank A4 pages; duplicate, rotate, reorder, and delete pages.
- Preview pages with device-pixel-aware thumbnails for sharp text and image edges.
- Undo and redo document edits.
- Use platform-aware application shortcuts: menus show Command on macOS and
  Control on Windows and Linux from the same shortcut definitions.
- Switch between Select (`V`), Pan (`H`), and drag-to-zoom (`Z`) tools. Trackpad panning, pinch zoom, Space-drag, and middle-button panning remain available while selecting.
- Export at 96, 150, or 300 DPI, preserve untouched source pages, and keep,
  limit, or normalize physical page sizes.
- Install and reopen the application offline after its first GitHub Pages visit.
- Restore the active document after reload from an on-device IndexedDB autosave,
  including original PDFs and imported images.
- Edit different documents safely in different tabs; each document has a URL
  identity, while a second editor for the same document is blocked.

Imported PDF text, vectors, links, forms, and annotations are not editable.
Untouched pages can be copied into the result without flattening; edited or
resized pages are intentionally flattened during export.

## Interface

The full-screen layout has a page filmstrip on the left, a React Konva workspace in the center, and a layer stack with selected-layer properties on the right. Panels are resizable. Page and layer rows use animated sorting as they are dragged, support keyboard reordering from the focused row, and commit one undoable change when dropped. Page actions are available from the thumbnail context menu. Select, pan, zoom, and fit controls sit directly on the workspace beneath the active page.

The top application bar uses compact File, Edit, Insert, and Page menus. File
includes Close document, which flushes autosave and releases that tab without
deleting the saved document. The document name stays centered, while the
Scannerize brand and menus sit on the left and history controls with the primary
Export action remain on the right.

The interface uses shadcn/Base UI components installed through `shadcn add` and Lucide icons. It avoids dashboard-style cards: bordered containers are reserved for functional items such as page thumbnails, the paper surface, dialogs, and menus.

Visual rules:

- Keep labels and helper copy short; do not stack redundant titles, tags, subtitles, or descriptions.
- Use the dark graphite-plus-blue semantic palette defined in
  `src/app/globals.css`; keep document paper white and visually dominant.
- Do not add colorful gradients, decorative textures, glow effects, glassmorphism, or scattered shadows.
- Use locally bundled proportional fonts; do not use monospaced fonts.
- Prefer flat surfaces, borders, spacing, and contrast. The paper surface is the one elevated workspace element.

## Architecture

Next.js uses `output: "export"` and produces a deployable `out/` directory. There are no route handlers, Server Actions, APIs, serverless functions, or document-processing services.

- `pdfjs-dist` loads local PDF bytes and rasterizes page backgrounds in a locally emitted worker.
- `react-konva` and `konva` render and transform editable overlay layers.
- `@dnd-kit/react` provides animated pointer, touch, and keyboard sorting for pages and layers.
- `@tanstack/react-hotkeys` registers application commands and formats their
  platform-correct menu shortcuts.
- Dexie stores documents and their source assets in IndexedDB using a
  versioned schema scoped to the deployment base path.
- `zustand`, `immer`, and `zundo` hold the serializable document model and history.
- `pdf-lib` creates the final PDF from page-sized flattened canvases.
- Workbox generates `out/sw.js` after the static build and precaches the application shell.
- Manrope Variable and Source Serif 4 Variable are bundled locally.

Page and layer geometry is stored in PDF points, independent of screen zoom and export DPI. PDF.js proxies, decoded images, object URLs, and canvases stay in disposable runtime registries rather than editor history.

Autosave writes each serializable document after completed edits and stores each
source PDF or image once by stable ID. The document ID is encoded in the URL
hash, which remains compatible with a static GitHub Pages export and lets each
tab reload its own document. Web Locks provide exclusive editing ownership per
document, with BroadcastChannel coordination as a fallback; different document
IDs remain independently editable. Reload recovery recreates PDF.js proxies,
decoded images, and object URLs from persisted source assets. Browser storage
remains local to the current origin and can still be removed when the user
clears site data; exporting a PDF remains the durable external backup.

Export is sequential. Untouched, unscaled PDF pages can be copied directly into
the result. Other pages are rasterized at the chosen DPI, visible overlays are
drawn from the document model, and the composite is fitted without cropping to
its planned output size before being embedded with `pdf-lib`. Automatic sizing
uses the median dimensions of the document's dominant page-size group and can
shrink oversized outliers without changing normal or smaller pages.

## Offline and GitHub Pages

GitHub Pages is the static host, not an application server. On the first visit it serves HTML, CSS, JavaScript, fonts, and the PDF.js worker. The generated service worker caches those assets so later visits can load with no connection. All import, editing, and export work is local on every visit.

Direct `file://` execution is not supported because browsers restrict module workers and service workers there. This does not imply a backend: the deployment is the same static-site model as GitHub Pages.

For a project site such as `https://owner.github.io/scannerize/`, build with:

```bash
NEXT_PUBLIC_BASE_PATH=/scannerize pnpm build
```

The included GitHub Actions workflow derives that repository base path and deploys `out/`. A root-domain Pages site uses an empty base path.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
```

`pnpm build` uses Next's webpack builder because it is deterministic in restricted build environments, then generates the offline precache. The final route is statically prerendered.

## Current limits

- Editing targets desktop and tablet landscape; narrow screens show a width notice.
- Text is edited in the properties panel rather than directly on the canvas.
- Blank pages use A4 size.
- Saved documents can be reopened by their document URL or as the most recently
  active document; there is not yet a recent-document browser or downloadable
  editable project format.
- Very large PDFs and 300 DPI exports remain subject to each browser's memory and canvas limits.
