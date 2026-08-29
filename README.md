<img src="shared/OpenCreate-Forge-Logo-dark.svg" alt="OpenCreate Forge Logo" width="300" />

# OpenCreate Forge

OpenCreate Forge is a free, open-source image editor for focused creative work. It combines a responsive canvas, non-destructive layers, precise tools, and a local workflow for creators moving beyond Photoshop or Photopea.

The project is built in public and is designed to keep your work, files, and editing decisions under your control.

**[Download the latest release](https://github.com/opencreate-app/forge/releases/latest)** · **[Visit the project site](https://opencreate-app.github.io/forge/)**

## Features

- **Responsive canvas:** A double-buffered rendering engine keeps interactions smooth while working with detailed, high-resolution images.
- **Non-destructive editing:** Organize raster, text, group, fill, and Smart Object layers without permanently flattening the work beneath them.
- **Professional tools:** Brush, Pencil, Eraser, Move, Select, Transform, Crop, Paint Bucket, Gradient, Color Picker, and Text tools.
- **Rich text editing:** Format text with font family, size, color, bold, italic, underline, strikethrough, superscript, and subscript controls.
- **Gradients and fills:** Create linear, radial, and angular gradient layers, edit color stops and opacity, and use foreground-to-transparent or rainbow presets.
- **Layer masks and styles:** Apply editable masks, strokes, drop shadows, inner shadows, blending modes, opacity, and fill settings.
- **Smart Objects:** Convert layers into editable nested projects, transform them without losing the original state, and rasterize them when needed.
- **Precision workflow:** Use rulers, guides, snapping, zoom from 5% to 5000%, and accurate transforms for pixel-level placement.
- **Flexible file support:** Open and save `.ocfd` projects, and import or export PNG, JPEG, and WEBP images.
- **History and recovery:** Use undo/redo, optional history persistence, autosave settings, and Session Guard recovery after an unexpected exit.
- **Project workflow:** Work with multiple project tabs, recent-project thumbnails, drag-and-drop imports, layer transfers, and clipboard export.

## Downloads

The current public release is **v0.3.0 (Alpha 3)**.

- **[Linux — AppImage for x86_64](https://github.com/opencreate-app/forge/releases/download/v0.3.0/OpenCreate.Forge-0.3.0.AppImage)**
- **[macOS — Apple Silicon (arm64)](https://github.com/opencreate-app/forge/releases/download/v0.3.0/OpenCreate.Forge-0.3.0-arm64.dmg)**
- **[Windows — Windows 10/11 (x86_64)](https://github.com/opencreate-app/forge/releases/download/v0.3.0/OpenCreate.Forge.Setup.0.3.0.exe)**

### macOS notes

The macOS artifacts use ad-hoc signing and are not notarized by Apple. On an Apple Silicon Mac, download the arm64 DMG and install the app in `/Applications`.

If macOS blocks the app, open it once and then go to **System Settings → Privacy & Security → Open Anyway**, confirm **Open**, and try again. This approval may be required for builds distributed without Apple notarization.

Launch the app from Finder, the Dock, or with:

```bash
open -a "OpenCreate Forge"
```

For local startup diagnostics, see:

```text
~/Library/Logs/OpenCreate Forge/startup.log
```

## Technology stack

- **[Electron](https://www.electronjs.org/):** Desktop shell and native file-system integration.
- **[React 19](https://react.dev/):** Renderer UI and editor interface.
- **[TypeScript 6](https://www.typescriptlang.org/):** Strong typing across the editor and canvas engine.
- **[Zustand 5](https://zustand-demo.pmnd.rs/):** Project, layer, tool, preference, and UI state management.
- **[Tailwind CSS v4](https://tailwindcss.com/):** Interface styling.
- **[Vite 8](https://vite.dev/):** Development server and production build pipeline.
- **[HTML5 Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API):** Core rendering surface for image editing.

The desktop shell, renderer, canvas engine, layer models, and tools are kept in separate areas of the codebase so the product can grow without making the editor harder to understand.

## Development setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [npm](https://www.npmjs.com/)

Clone the repository and install dependencies:

```bash
git clone https://github.com/opencreate-app/forge.git
cd forge
npm install
```

Start the development build:

```bash
npm run dev
```

## Build, test, and quality checks

```bash
# Full production build and Electron packaging
npm run build

# TypeScript and ESLint checks
npm run check

# Run all tests
npm run test:all

# Run focused suites
npm run test:tools
npm run test:layers
npm run test:project

# Format the repository
npm run prettier
```

## Extending Forge

New canvas tools should extend `BaseTool` in `src/core/tools/BaseTool.ts`. The tool receives a typed context for the current project, engine, selection, settings, and input events.

```ts
export class CustomTool extends BaseTool {
  id: ToolId = "custom";

  onMouseMove(event: MouseEvent, context: ToolContext) {
    // Keep custom tool behavior close to the canvas.
  }
}
```

The repository is organized into:

- `src/core/` — canvas engine, layer models, image utilities, and editing tools.
- `src/renderer/` — React UI, Zustand stores, hooks, and renderer utilities.
- `src/main/` — Electron main process, preload bridge, and update behavior.
- `test/` — Vitest suites for the core and renderer.
- `docs/` — Technical notes and release documentation.

## File format and exports

The native `.ocfd` format preserves project layers, metadata, and editor state instead of flattening the creative process. Use the File menu to export finished images as PNG, JPEG, or WEBP, with configurable dimensions and quality where supported.

## Contributing

Bug reports, ideas, code, documentation, and design contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), open an issue for bugs or proposals, and include reproduction details for behavior changes.

- **[Report a bug or idea](https://github.com/opencreate-app/forge/issues)**
- **[Contribution guide](CONTRIBUTING.md)**
- **[Project website](https://opencreate-app.github.io/forge/)**

## License

OpenCreate Forge is distributed under the [GNU General Public License v3.0](LICENSE).

Created with ❤️ by [Gabriel Borges](https://github.com/gabrielborgesweb).
