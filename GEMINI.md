# Gemini Project Instructions: OpenCreate Forge

OpenCreate Forge is a modern, high-performance, and open-source image manipulation software. It combines web technologies (React, Tailwind, Zustand) with a custom-built canvas engine and Electron for a seamless desktop editing experience.

---

## AI Prompting & Behavior (Read First)

When generating code or architectural advice for this project, adhere to these rules:

1. **No Obsolete Syntaxes:** React 19 uses the new `use` hook, server/client directive nuances, and decoupled ref props. Do not suggest legacy React 17/18 patterns.
2. **Performance First:** The custom `ForgeEngine` runs on HTML5 Canvas. Avoid triggering frequent React re-renders for mouse/draw events. Keep state changes scoped.
3. **Type Safety:** Never use `any`. If a type is complex or dynamic, use generics (`<T>`) or strict `unknown` with type guards.
4. **Contextual Awareness:** Always respect the separation between Electron's Main Process (Node.js) and Renderer Process (Browser).

---

## Project Overview

- **Main Technologies:** Electron, React 19, TypeScript 6, Tailwind CSS v4, Zustand 5, Vite 8.
- **Core Engine:** Custom-built `ForgeEngine` (`src/core/engine/ForgeEngine.ts`) using HTML5 Canvas for real-time image manipulation.
- **Architecture:**
  - **Main Process (`src/main/`):** Handles Electron lifecycle, window management, native menus, and IPC for file/system operations.
  - **Renderer Process (`src/renderer/`):** React-based UI. Global state is managed with Zustand stores in `src/renderer/store/`.
  - **Core Layer System (`src/core/layers/`):** Extensible layer types (Raster, Text, Group, Smart Object).
  - **Tool System (`src/core/tools/`):** Extensible tool architecture. All tools inherit from `BaseTool`.

## Key Commands

- `npm run dev`: Starts the Vite development server and Electron.
- `npm run build`: Compiles TypeScript, builds the renderer with Vite, and packages the app with Electron Builder.
- `npm run test:all`: Executes all Vitest test suites.
- `npm run test:tools` / `npm run test:layers` / `npm run test:project`: Runs specific test categories.
- `npm run check`: Performs TypeScript type checking (`tsc`) and ESLint.
- `npm run prettier`: Formats the codebase using Prettier.
- `npm run lint`: Runs ESLint for code quality checks.

---

## Development Conventions

### Coding Standards

- **TypeScript:** Strict mode enabled. Use discriminated unions for Layer and Tool states.
- **Formatting & Linting:** Adhere to Prettier and Flat Config ESLint (`eslint.config.js`). Run checks before committing.
- **Naming:**
  - Components: PascalCase (e.g., `CanvasViewport.tsx`).
  - Stores/Hooks/Utils: camelCase (e.g., `projectStore.ts`, `useAutosave.ts`).
  - Layers/Tools: PascalCase (e.g., `RasterLayer.ts`, `BrushTool.ts`).

### Architecture & Extensions

#### Adding a New Tool

- Create a new class in `src/core/tools/` extending `BaseTool`.
- Implement necessary event handlers (`onMouseDown`, `onMouseMove`, `onRender`, etc.).
- Register the tool in `ForgeEngine.ts` and `src/renderer/constants/tools.tsx`.

#### Adding a New Layer Type

- Define the layer structure in `src/renderer/store/projectStore.ts`.
- Create a new layer class in `src/core/layers/` with a static `render` method.
- Update `ForgeEngine.renderLayer` to handle the new type.

#### State Management

- Use Zustand for global state (`src/renderer/store/`).
- **Rule:** Prefer small, focused stores (e.g., `toolStore`, `uiStore`) and use selectors to prevent unnecessary React re-renders.

### Path Aliases

- `@/*`: `src/*`
- `@core/*`: `src/core/*`
- `@ui/*`: `src/renderer/*`
- `@store/*`: `src/renderer/store/*`
- `@utils/*`: `src/renderer/utils/*`

### UI & Styling

- **Tailwind CSS v4:** Use native utility classes. Custom CSS goes strictly to `src/renderer/index.css`.
- **Icons:** Use `lucide-react` exclusively.

### Testing

- **Framework:** Vitest.
- **Mocks:** Use `test/mocks.ts` and `vitest-canvas-mock` for canvas-related tests.
- **Location:** Unit tests must mirror the `src/` structure inside the `test/` directory.

---

## Technical Details

- **Canvas Engine:** Double-buffering strategy. Projects render 1:1 in an offscreen buffer before being drawn to the viewport with zoom and pan transformations.
- **History (Undo/Redo):** Managed via a custom history stack inside `projectStore.ts`. Avoid storing full images in history; store state mutations or deltas.
- **File Format (.ocfd):** JSON-based format containing metadata and layer data. Large binary data (Raster Layers) is Base64 encoded.
- **IPC Safety:** The renderer communicates via `window.electronAPI` (defined in `src/main/preload.ts`). _Never expose raw Node.js modules to the renderer._
