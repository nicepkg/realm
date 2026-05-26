import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@realm/api-contract": path.join(root, "packages/api-contract/src/index.ts"),
      "@realm/client-sdk": path.join(root, "packages/client-sdk/src/index.ts"),
      "@realm/core": path.join(root, "packages/core/src/index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3737,
  },
});
