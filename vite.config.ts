import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Served from GitHub Pages at https://nrs2013.github.io/count-down-studio/
// Vite base must match the sub-path.
export default defineConfig({
  plugins: [react()],
  base: "/count-down-studio/",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
