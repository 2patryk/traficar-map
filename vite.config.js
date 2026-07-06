import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // fioletowe.live nie wysyła nagłówków CORS — w dev proxujemy /api przez Vite
    proxy: {
      '/api': {
        target: 'https://fioletowe.live',
        changeOrigin: true,
      },
    },
  },
})
