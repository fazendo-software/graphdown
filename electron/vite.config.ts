import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: fileURLToPath(new URL("./main.ts", import.meta.url)),
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: { external: ["electron", "ws"] },
  },
});
