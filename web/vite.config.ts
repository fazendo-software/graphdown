import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Caminho absoluto: `root` relativo cai no cwd, e os scripts do package.json rodam da
// raiz do repo (`vite build --config web/vite.config.ts`), nao de dentro de web/.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:5174", ws: false } },
  },
});
