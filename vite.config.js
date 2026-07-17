import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/v1': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
})
