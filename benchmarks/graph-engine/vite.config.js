import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    build: {
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    sigma: ['sigma', 'graphology'],
                    g6: ['@antv/g6'],
                    cytoscape: ['cytoscape'],
                    xyflow: ['@xyflow/react']
                }
            }
        }
    }
})
