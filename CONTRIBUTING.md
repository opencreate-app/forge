# Contributing to OpenCreate Forge

First off, thank you for considering contributing to OpenCreate Forge! It's people like you who make it a great tool for the creative community.

By contributing, you agree to abide by our terms and that your contributions will be licensed under the **GNU GPL v3**.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- [npm](https://www.npmjs.com/)
- A basic understanding of React, TypeScript, and Electron.

### Setup

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/opencreate-app/forge.git
   cd opencreate-forge
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🛠️ Development Workflow

### 1. Find or Create an Issue

Before starting any work, please ensure there is an issue describing the feature or bug. If not, feel free to create one! This helps avoid duplicate work.

### 2. Create a Branch

Use a descriptive branch name:

- `feat/description-of-feature`
- `fix/description-of-bug`
- `docs/description-of-change`

### 3. Coding Standards

- **TypeScript:** We use strict typing. Avoid `any` at all costs.
- **React:** Use functional components and hooks (React 19).
- **Styling:** Use Tailwind CSS v4 utilities.
- **Documentation:**
  - Every new file in `src/` must have a descriptive header.
  - Use JSDoc/TSDoc for classes and public methods.
- **Engine:** If you are adding a tool, extend the `BaseTool` class in `src/core/tools`.

### 4. Testing

We use `vitest` for testing. Ensure your changes don't break existing tests and add new tests for your features.

```bash
npm run check  # Runs TSC and Lint
npm run test:all # Runs all tests
```

---

## 📝 Commit Guidelines

We follow a clean commit history. Try to keep your commits atomic and use clear messages.
Example: `feat(tools): add hardness property to Brush tool`

---

## 📬 Submitting a Pull Request

1. Push your changes to your fork.
2. Open a Pull Request (PR) against the `main` branch of the official repository.
3. Provide a clear description of the changes and link to the relevant issue.
4. Wait for code review. We might suggest some changes to keep the codebase consistent.

---

## ⚖️ License

By contributing to OpenCreate Forge, you agree that your contributions will be licensed under the [GNU GPL v3](LICENSE).
