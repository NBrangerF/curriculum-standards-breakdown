import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cardVersion } from './src/seo/pageMeta.js'

const dataVersion = JSON.parse(readFileSync('public/data/data_version.json', 'utf8')).data_version

// Make `vite preview` route like vercel.json: a prerendered page if one exists
// (scripts/prerender-pages.mjs), otherwise the bare app shell.
function prerenderedPagesPreview() {
  return {
    name: 'kebiao-prerendered-pages-preview',
    configurePreviewServer(server) {
      const dist = resolve(server.config.root, server.config.build.outDir)
      server.middlewares.use((req, _res, next) => {
        const path = (req.url || '/').split('?')[0]
        if (req.method !== 'GET' || path.includes('.') || path.startsWith('/api/')) return next()
        const page = path === '/api' ? 'api-page.html' : join(path, 'index.html')
        req.url = `/${existsSync(join(dist, page)) ? page : 'app-shell.html'}`.replace(/^\/+/, '/')
        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), prerenderedPagesPreview()],
  define: {
    'import.meta.env.VITE_KB_CARD_VERSION': JSON.stringify(cardVersion(dataVersion))
  },
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
