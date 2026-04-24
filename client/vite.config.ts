import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// In prod, the client's /api/* calls are handled by nginx (self-hosted) or by
// a compile-time VITE_API_BASE_URL (SaaS, pointing at the API subdomain). In
// local dev + Playwright E2E, the Vite dev server takes nginx's place and
// proxies /api + /widget + /embed.js + /health to the backend on :3001.
const BACKEND_PORT = Number(process.env.PORT) || 3001;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      "/api":      { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
      "/widget":   { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
      "/embed.js": { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
      "/health":   { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
    },
  },
});
