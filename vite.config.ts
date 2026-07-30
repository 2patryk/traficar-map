import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Odwzorowanie rewrite'ów z vercel.json: /api/v1 to upstream Traficar
    // (bez CORS, dlatego przez proxy), reszta to własny backend na mikrusie
    proxy: {
      '/api/v1': {
        target: 'https://fioletowe.live',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://eve137.mikrus.xyz:20137',
        changeOrigin: true,
      },
    },
  },
})
