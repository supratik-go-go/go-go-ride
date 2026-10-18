import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// In development the browser talks to Vite only; /api and /uploads are
// proxied to the FastAPI backend, so there is no CORS setup and the same
// relative URLs work everywhere. Production / mobile builds set VITE_API_URL.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.BACKEND_ORIGIN || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/uploads': { target: backend, changeOrigin: true },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
        '/uploads': { target: backend, changeOrigin: true },
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  }
})
