import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // dev: forward /api to the Worker (`pnpm dev` in server/ runs it on :8787)
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
})
