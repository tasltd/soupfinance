import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Changed: Make proxy target configurable via VITE_API_URL environment variable
// Default: http://localhost:9090 (local Grails backend)
// LXC mode: Set VITE_API_URL to http://{container-ip}:9090
export default defineConfig(({ mode }) => {
  // Load env file based on mode (.env, .env.lxc, etc.)
  const env = loadEnv(mode, process.cwd(), '')

  // Changed: Use VITE_API_URL from env or default to localhost:9090
  const apiTarget = env.VITE_API_URL || 'http://localhost:9090'

  console.log(`[vite] API proxy target: ${apiTarget}`)

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/rest': {
          target: apiTarget,
          changeOrigin: true,
        },
        // Added: Proxy for /client/* endpoints (public/unauthenticated)
        // Used by registration and other public client-facing APIs
        '/client': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
