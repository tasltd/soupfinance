import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Changed: Make proxy target configurable via VITE_PROXY_TARGET environment variable
// Default: http://localhost:9090 (local Grails backend)
// LXC mode: Set VITE_PROXY_TARGET to http://{container-ip}:9090
//
// IMPORTANT: VITE_PROXY_TARGET controls where the Vite proxy forwards requests.
// The frontend uses VITE_API_URL (relative path like '/rest') for API calls.
// Do NOT use the same variable for both - direct backend calls bypass the proxy
// and cause CORS/redirect issues.
export default defineConfig(({ mode }) => {
  // Load env file based on mode (.env, .env.lxc, etc.)
  const env = loadEnv(mode, process.cwd(), '')

  // Changed: Use VITE_PROXY_TARGET for proxy destination (separate from frontend API URL)
  const apiTarget = env.VITE_PROXY_TARGET || 'http://localhost:9090'

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
