import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    port: 5173,
    // Proxy API ke backend agar frontend cukup memakai path relatif /api/v1 (tanpa CORS saat dev)
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
