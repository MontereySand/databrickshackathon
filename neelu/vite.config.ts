import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The Express server (src/server/index.ts) consumes this config in middleware
// mode for local dev, and `vite build` emits the static client into dist/client
// which the same server serves in production (Databricks App / `npm run start`).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    hmr: false,
    ws: false,
  },
})
