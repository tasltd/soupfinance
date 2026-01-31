import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
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
//
// API Consumer Authentication:
// The backend ApiAuthenticatorInterceptor validates API consumer credentials for external apps.
// For logged-in users (ROLE_ADMIN/ROLE_USER), this is bypassed.
// For development/testing with unauthenticated endpoints, set:
//   - VITE_API_CONSUMER_ID: API consumer UUID
//   - VITE_API_CONSUMER_SECRET: API consumer secret
// The proxy will add Api-Authorization header: Basic base64(id:secret)
export default defineConfig(({ mode }) => {
  // Load env file based on mode (.env, .env.lxc, etc.)
  const env = loadEnv(mode, process.cwd(), '')

  // Changed: Use VITE_PROXY_TARGET for proxy destination (separate from frontend API URL)
  const apiTarget = env.VITE_PROXY_TARGET || 'http://localhost:9090'

  // API Consumer credentials for backend identification
  const apiConsumerId = env.VITE_API_CONSUMER_ID
  const apiConsumerSecret = env.VITE_API_CONSUMER_SECRET

  console.log(`[vite] API proxy target: ${apiTarget}`)
  if (apiConsumerId) {
    console.log(`[vite] API Consumer: ${apiConsumerId} (credentials configured)`)
  }

  // Build Api-Authorization header if credentials are provided
  const apiAuthHeader = apiConsumerId && apiConsumerSecret
    ? `Basic ${Buffer.from(`${apiConsumerId}:${apiConsumerSecret}`).toString('base64')}`
    : null

  // Configure proxy with optional API consumer headers
  const proxyConfig: ProxyOptions = {
    target: apiTarget,
    changeOrigin: true,
    // Add API consumer authentication header if configured
    ...(apiAuthHeader && {
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.setHeader('Api-Authorization', apiAuthHeader)
        })
      },
    }),
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/rest': proxyConfig,
        // Added: Proxy for /client/* endpoints (public/unauthenticated)
        // Used by registration and other public client-facing APIs
        '/client': proxyConfig,
      },
    },
  }
})
