import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "oauth/index": "src/oauth/index.ts",
      "storage/index": "src/storage/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    splitting: true,
    clean: true,
    target: "es2022",
  },
]);
