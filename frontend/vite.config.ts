/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Rails serves the built viewer from public/, so an installed copy needs
  // no Node at runtime.
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
  },
  server: {
    port: 3081,
    strictPort: true,
    // Proxy the API to Rails so the browser sees a single origin.
    proxy: {
      '/api': 'http://localhost:3080',
      '/up': 'http://localhost:3080',
    },
  },
})
