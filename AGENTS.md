<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Scannerize project rules

Scannerize is an offline-first, browser-only PDF finishing editor. Read `README.md` before implementation; it is the product and architecture plan.

## Non-negotiable architecture

- Preserve Next.js static export and GitHub Pages compatibility. Do not introduce route handlers, Server Actions, application servers, APIs, serverless functions, runtime server dependencies, remote font loading, or any document-processing service.
- PDF bytes and user images must stay on-device. Core import, editing, recovery, and export flows must work with network access disabled.
- Treat the editor as a client-only boundary. Guard browser APIs from prerendering and dynamically load browser-only canvas/PDF modules where needed.
- Use PDF.js only to inspect and rasterize imported pages. Imported PDF content is a locked, immutable page background; do not imply that existing text or vectors remain editable.
- Keep the serializable document store as the source of truth. Konva node refs, PDF.js proxies, object URLs, `ImageBitmap`s, canvases, and other runtime objects belong in disposable caches, not store state, history, or persistence.
- Store page and overlay geometry in PDF points, independent of viewport zoom or render DPI. Use stable IDs for documents, pages, and layers; never use array indexes as identity.
- Export from the document model at the selected DPI, one page at a time. Never export the screen-resolution preview canvas.
- Bundle the PDF.js worker, fonts, icons, and all other required runtime assets locally. Verify their URLs from the built `out/` directory.
- Treat the GitHub Pages repository base path as part of the architecture. Next.js assets, the manifest, PDF.js worker, service-worker registration, and precache URLs must work from both a repository subpath and the domain root.
- Precache the complete application shell with a generated service worker so a previously loaded deployment reopens without a network connection. The service worker must version caches and remove obsolete versions on activation.
- Publish a build-ID manifest outside the service-worker precache. Updated workers must wait for explicit activation until the editor has flushed autosave; update checks must fail silently offline and remain compatible with the GitHub Pages base path.

## UI and component rules

- Use the existing shadcn/Base UI setup for accessible application chrome and controls. Check installed components and current component documentation before use.
- Keep the Konva stage, transform handles, snap guides, and canvas interactions custom; do not force DOM components into the canvas.
- Maintain the three-pane desktop layout: page filmstrip on the left, active-page pasteboard in the center, and active-page layers/properties on the right.
- Prefer a compact, precise print-workstation visual language: graphite chrome, warm paper, restrained typography, and one safety-orange interaction accent. Avoid generic dashboard cards and decorative gradients.
- Minimize card usage. Do not wrap ordinary panels, property groups, toolbar sections, or empty states in `Card`; reserve bordered containers for functional objects that need a boundary.
- Keep interface copy minimal and functional. Do not add redundant labels, tags, badges, subtitles, or long descriptions; one clear label should carry each idea. Helper text is only for ambiguity, consequences, or recovery.
- Define the entire neutral-plus-accent palette once with semantic tokens in `src/app/globals.css`. Do not introduce raw component colors, multicolor gradients, glow effects, glassmorphism, or decorative textures.
- Use borders, spacing, and contrast before shadows. Allow only restrained, consistent elevation where separation is necessary, such as the paper above the pasteboard; do not scatter arbitrary shadows across controls and panels.
- Use locally bundled proportional fonts only. Do not use or offer monospaced fonts in application chrome, numeric values, shortcuts, page labels, or the initial text-layer font presets.
- Major actions require keyboard equivalents and visible focus. Reordering must support keyboard interaction, icon-only controls need accessible names and tooltips, and destructive page/document actions need appropriate confirmation.
- Use `lucide-react` exclusively for interface icons. Do not mix icon libraries or add custom SVG icons when a suitable Lucide icon exists. Icons inside shadcn buttons use `data-icon`, inherit component sizing, and must not receive manual sizing classes.
- Use semantic theme tokens and existing component variants. Follow the repository shadcn skill rules for composition, forms, spacing, icons, dialogs, and feedback components.

## Editing and performance rules

- Commit one history entry per completed gesture; do not write every pointer-move frame into global state or undo history.
- Render thumbnails lazily and render the active page at viewport-appropriate resolution. Bound caches and explicitly release canvases, bitmaps, object URLs, and PDF resources.
- All page operations must preserve mixed physical page sizes and stable layer coordinates.
- Text fonts must be locally bundled and fully loaded before measuring or exporting text.
- Preserve the three text-frame modes: auto width follows unwrapped content, auto
  height wraps at a fixed width and follows content height, and fixed size clips
  overflow. Resizing a text frame must change its bounds live without scaling its
  glyphs, and canvas, thumbnail, and export layout rules must stay aligned.
- Long imports and exports need progress, cancellation points, and actionable errors. Detect encrypted/corrupt PDFs and browser canvas/memory limits without crashing the editor.

## Verification

- Use pnpm, matching `packageManager` in `package.json`.
- Before declaring a change complete, run the narrowest relevant checks plus `pnpm lint` and `pnpm build` when feasible.
- Test the exact `out/` artifact under a GitHub Pages-style repository subpath. Complete one online load, wait for service-worker control, then reload and exercise the editor with network access disabled.
- For export changes, validate page count, order, dimensions, and rendered placement by reopening the produced PDF, not only by checking that a Blob downloaded.
- Add unit tests for pure document operations and browser tests for import, canvas editing, page management, undo/redo, offline behavior, and export.
