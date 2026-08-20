<img src="shared/OpenCreate-Forge-Logo-dark.svg" alt="OpenCreate Forge Logo" width="300" />

**OpenCreate Forge** is a modern, high-performance, and open-source image manipulation software. Built with a focus on professional creative workflows, it combines the flexibility of web technologies with the power of a custom-built canvas engine to deliver a seamless editing experience.

**[💻 Download Latest Release](https://github.com/opencreate-app/forge/releases/latest)**

## ✨ Features

- 🎨 **Powerful Canvas Engine:** A custom-built rendering engine optimized for high-resolution image manipulation and real-time tool feedback.
- 🏗️ **Advanced Layer System:** Manage your project with Raster, Text, and Group layers, supporting complex hierarchies and compositing.
- 🛠️ **Professional Toolset:** Includes essential tools like Brush, Pencil, Eraser, Move, Selection, Transform, Crop, and a rich Text editor.
- 📜 **Non-Destructive History:** Full undo/redo support to explore your creativity without fear of losing progress.
- 📁 **Native File Support:** Save and load projects using the `.ocfd` (OpenCreate Forge Document) format, preserving all layers and metadata.
- 📐 **Precision UI:** Built-in rulers, guides, and viewport transformations (zoom/pan) for pixel-perfect accuracy.
- ⚡ **Modern Interface:** A sleek, dark-themed UI built with React 19 and Tailwind CSS v4, optimized for focus and efficiency.

---

## 🛠️ Technology Stack

- **[Electron](https://www.electronjs.org/):** Used to provide a robust desktop environment. It allows us to leverage web technologies while maintaining direct access to the native file system and system-level performance optimizations.
- **[React 19](https://react.dev/):** The foundation of our UI. We use it for its declarative component model and efficient state updates, which are critical for managing the complex, real-time property panels and sidebar controls.
- **[TypeScript 6](https://www.typescriptlang.org/):** Ensures a type-safe codebase. For a project with complex engine logic and layer structures, TypeScript provides the necessary tooling to prevent bugs and maintain scalability.
- **[Zustand 5](https://zustand-demo.pmnd.rs/):** Our choice for state management. It is lightweight and highly performant, making it perfect for handling global project state (layers, selection, history) without the overhead of heavier frameworks.
- **[Tailwind CSS v4](https://tailwindcss.com/):** Enables rapid and consistent UI development. Its utility-first approach and the latest v4 features allow us to build a beautiful, modern interface with minimal CSS footprint.
- **[Vite 8](https://vite.dev/):** The build tool of choice. It provides lightning-fast Hot Module Replacement (HMR) and optimized build pipelines, significantly improving the developer experience in an Electron environment.
- **[HTML5 Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API):** The core of the engine. It provides low-level pixel manipulation and hardware-accelerated rendering, which is essential for a high-performance image editor.

---

## 🚀 How to Run (Development)

### Prerequisites

- [Node.js](https://nodejs.org/) (Recommended: v20 or higher)
- [npm](https://www.npmjs.com/)

1. Clone the repository:

```bash
git clone https://github.com/opencreate-app/forge.git
cd opencreate-forge
```

2. Install the dependencies:

```bash
npm install
```

3. Run in development mode:

```bash
npm run dev
```

---

## 📦 How to Build and Run

### macOS Release Builds

The macOS artifacts currently do not have an Apple Developer ID signature or notarization. On an Apple Silicon Mac, download the arm64 DMG and install the app in `/Applications`.

On the first launch, open the app from Finder. If macOS blocks it, try opening it once, then go to **System Settings → Privacy & Security → Open Anyway** and confirm **Open**. This manual approval is required for builds distributed without Apple notarization.

For local diagnostics, startup errors are written to:

```text
~/Library/Logs/OpenCreate Forge/startup.log
```

### Building

```bash
# Full build (TypeScript check + Vite build + Electron builder)
npm run build
```

### Testing

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test:tools
npm run test:layers
npm run test:project
```

### Linting and Quality

```bash
# Run TypeScript Checking
npm run tsc

# Run ESLint
npm run lint

# Comprehensive check (TSC + Lint)
npm run check

# Prettier formatting
npm run prettier
```

---

## 📝 Usage Notes

- **Performance:** The engine uses hardware acceleration where available. For large projects, ensure your graphics drivers are up to date.
- **File Format:** `.ocfd` files are JSON-based and intended for use exclusively within OpenCreate Forge. You can export to standard formats (PNG, JPG) via the File menu (WIP).
- **Custom Tools:** The architecture is designed to be extensible. You can implement new tools by extending the `BaseTool` class in the core directory.

---

Created with ❤️ by [Gabriel Borges](https://github.com/gabrielborgesweb)

Generated through [Gemini CLI](https://geminicli.com) (`gemini-3-flash-preview`) and [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) (`gpt-5.6-luna`).
