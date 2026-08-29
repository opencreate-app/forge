# Repository Guidelines

## Project Structure & Module Organization

- `src/core/` contains the canvas engine, layer models, image utilities, and editing tools. New tools should extend `src/core/tools/BaseTool.ts`.
- `src/renderer/` contains the React UI, Zustand stores, hooks, styling, and renderer utilities.
- `src/main/` contains Electron main-process code, including preload and auto-update behavior.
- `test/` mirrors core and renderer areas (`test/core/...`, `test/renderer/...`) and contains Vitest setup/mocks.
- `public/` and `shared/` contain static pages, logos, icons, and build assets; `docs/` contains technical notes.
- `dist/` and `dist-electron/` are generated build output and should not be edited manually.

## Build, Test, and Development Commands

Install with `npm install`, then use:

- `npm run dev` — start the Vite development server.
- `npm run check` — run TypeScript (`tsc`) and ESLint checks.
- `npm run test:all` — run the complete Vitest suite once; `npm run test:watch` runs it interactively.
- `npm run test:tools`, `npm run test:layers`, and `npm run test:project` — run focused suites.
- `npm run build` — clean generated output, compile, bundle, and package with electron-builder.
- `npm run prettier` — format the repository with the checked-in Prettier configuration.

Run `npm run check` and relevant tests before opening a pull request.

## Coding Style & Naming Conventions

Use TypeScript with strict typing and avoid introducing `any`. Follow two-space indentation, double quotes, semicolons, trailing commas, LF endings, and 100-character print width. Prettier and ESLint are authoritative (`.prettierrc`, `eslint.config.js`). Use PascalCase for React components, classes, and layer/tool files; camelCase for functions, hooks, stores, and utilities. Prefer functional React components, hooks, Tailwind CSS v4 utilities, and descriptive names. Add a descriptive header to new `src/` files and JSDoc/TSDoc for public classes and methods.

## Testing Guidelines

Tests use Vitest with Testing Library and canvas mocks. Name files `*.test.ts` or `*.test.tsx`, place them under the matching `test/` domain, and add regression coverage for behavior changes. Keep tests deterministic; use the existing setup and mocks rather than duplicating initialization.

## Commit & Pull Request Guidelines

Commits follow Conventional Commits with a scope where useful, for example `feat(tools): add hardness property to Brush tool` or `fix(updater): improve status reporting`. Keep commits focused. Branches conventionally use `feat/`, `fix/`, or `docs/` prefixes. Pull requests should target `main`, explain the change and testing performed, link the relevant issue, and include screenshots or recordings for visible UI changes. Contributors must follow the GNU GPL v3 terms in `LICENSE`.

### Commit messages should be structured as follows:

```
<type>(<scope>): <subject>

- Clarify the change in a concise manner.
- Use imperative mood in the subject line.
- Include a body if necessary to explain the reasoning behind the change.
```

If possible, use `$'- New line about the change.\n- Another line about other changes.'` for `\n` to create a new line in the commit message body.
