import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {}
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'https://api.cspr.cloud',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            proxyReq.setHeader('authorization', '0198d342-112b-743b-aaf7-61745bdd3ecd')
          })
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
