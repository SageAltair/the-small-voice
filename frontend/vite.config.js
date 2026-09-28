import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // api.js builds its base URL from VITE_API_URL first and only reaches for
    // window.location in dev, so pinning it here keeps the service tests off the
    // browser globals and gives them a URL to assert against.
    env: { VITE_API_URL: 'http://photos.test' },
  },
})
