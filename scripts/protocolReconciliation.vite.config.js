import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    minify: false,
    outDir: path.resolve(process.cwd(), ".protocol-reconciliation-cli"),
    rollupOptions: {
      output: {
        entryFileNames: "reconcileFounderProtocols.mjs",
      },
    },
    ssr: path.resolve(process.cwd(), "scripts/reconcileFounderProtocols.js"),
    target: "node22",
  },
});
