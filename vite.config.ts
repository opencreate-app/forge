/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: path.join(__dirname, "src/renderer"),
  publicDir: path.join(__dirname, "public"),
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: path.join(__dirname, "src/main/main.ts"),
        vite: {
          build: {
            outDir: path.join(__dirname, "dist-electron"),
          },
        },
      },
      preload: {
        input: path.join(__dirname, "src/main/preload.ts"),
        vite: {
          build: {
            outDir: path.join(__dirname, "dist-electron"),
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "./src/core"),
      "@ui": path.resolve(__dirname, "./src/renderer"),
      "@store": path.resolve(__dirname, "./src/renderer/store"),
      "@utils": path.resolve(__dirname, "./src/renderer/utils"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    root: path.resolve(__dirname, "."),
    setupFiles: [path.resolve(__dirname, "./test/setup.ts")],
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
