import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Served from custom domain (countdown-studio.nrs1.jp) at root path.
// Vite base is "/" since we're no longer under /count-down-studio/ subpath.
export default defineConfig({
  plugins: [react()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
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
