import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    // The Codex backend only allows CORS from specific localhost ports:
    // 3000, 5173, and 8000. Use 5173 with strictPort so we get a clear
    // error if the port is already taken rather than silently incrementing
    // to an unallowed port like 5174.
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
