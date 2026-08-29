# Contributing to OpenCreate Forge

Thank you for considering a contribution to OpenCreate Forge. The project is built in public, and bug reports, ideas, code, documentation, and design improvements are welcome.

By contributing, you agree that your contributions will be licensed under the [GNU General Public License v3](LICENSE).

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [npm](https://www.npmjs.com/)
- A basic understanding of React, TypeScript, and Electron

### Setup

1. Fork the repository on GitHub.
2. Clone your fork locally:

```bash
git clone https://github.com/opencreate-app/forge.git
cd forge
```

3. Install dependencies:

```bash
npm install
```

4. Start the development build:

```bash
npm run dev
```

## Project structure

- `src/core/` — canvas engine, layer models, image utilities, and editing tools.
- `src/renderer/` — React UI, Zustand stores, hooks, styling, and renderer utilities.
- `src/main/` — Electron main process, preload bridge, and update behavior.
- `test/` — Vitest suites for the core and renderer, including shared mocks and setup.
- `public/` and `shared/` — static pages, logos, icons, and build assets.
- `docs/` — technical notes and release documentation.
- `dist/` and `dist-electron/` — generated build output; do not edit manually.

## Development workflow

### 1. Find or create an issue

Before starting work, look for an existing issue describing the bug or feature. If none exists, open one first so the proposed change can be discussed and tracked.

### 2. Create a branch

Use a descriptive branch name with one of the repository's conventional prefixes:

- `feat/description-of-feature`
- `fix/description-of-bug`
- `docs/description-of-change`

Keep each branch and Pull Request focused on one coherent change.

### 3. Follow the coding standards

- Use strict TypeScript and avoid introducing `any`.
- Prefer functional React components and hooks.
- Use Tailwind CSS v4 utilities for styling.
- Follow the checked-in Prettier and ESLint configuration.
- Use two-space indentation, double quotes, semicolons, trailing commas, LF endings, and a 100-character print width.
- Use PascalCase for React components, classes, and layer/tool files; use camelCase for functions, hooks, stores, and utilities.
- Add a descriptive header to every new file under `src/`.
- Add JSDoc/TSDoc to public classes and methods.
- New canvas tools should extend `src/core/tools/BaseTool.ts`.

### 4. Add tests for behavior changes

Tests use Vitest, Testing Library, and canvas mocks. Add regression coverage for behavior changes in the matching `test/core/` or `test/renderer/` area. Keep tests deterministic and reuse the existing setup and mocks instead of duplicating initialization.

Run the relevant checks locally:

```bash
# TypeScript and ESLint
npm run check

# Complete test suite
npm run test:all

# Focused suites
npm run test:tools
npm run test:layers
npm run test:project
```

For a full local packaging check, run:

```bash
npm run build
```

Format the repository with:

```bash
npm run prettier
```

When working on macOS packaging or startup behavior, run the bundle smoke test on macOS after building:

```bash
npm run smoke:macos -- "dist/mac-arm64/OpenCreate Forge.app" arm64
```

Use the corresponding generated application path and architecture when validating an Intel build. The smoke test validates the bundle structure, architecture, ad-hoc signature, `Info.plist`, and packaged `app.asar`; it skips launching the app unless `SMOKE_MACOS_LAUNCH=true` is set.

## Commit guidelines

Use focused commits following Conventional Commits. Include a scope when it helps explain the affected area:

```text
feat(tools): add hardness property to Brush tool
```

Commit subjects should use imperative mood. Add a body when the reasoning or impact needs clarification. Keep unrelated changes out of the same commit.

## Pull Requests

1. Push your branch to your fork.
2. Open a Pull Request against the `main` branch of the official repository.
3. Explain what changed and why.
4. Link the relevant issue.
5. List the checks and tests you ran.
6. Include screenshots or a recording for visible UI changes.
7. Call out any known limitations, follow-up work, or release considerations.

Please respond to review feedback and keep follow-up commits focused. Generated directories such as `dist/` and `dist-electron/` should not be committed.

## License

By contributing to OpenCreate Forge, you agree that your contributions will be licensed under the [GNU General Public License v3](LICENSE).
