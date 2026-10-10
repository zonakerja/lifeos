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
  // Pindai semua source saat start agar dependensi yang hanya dipakai rute lazy (mis. qrcode.react di File Control)
  // ikut dioptimasi sejak awal; tanpa ini Vite mengoptimasi ulang saat rute dibuka → 504 "Outdated Optimize Dep"
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{ts,tsx}", "!src/**/*.test.{ts,tsx}"],
  },
  server: {
    port: 5173,
    // Port tetap: bila 5173 sudah dipakai (dev server lain masih berjalan), gagal alih-alih pindah ke 5174
    strictPort: true,
    // Proxy API ke backend agar frontend cukup memakai path relatif /api/v1 (tanpa CORS saat dev)
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
