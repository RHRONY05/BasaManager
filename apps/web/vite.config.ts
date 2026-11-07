/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const proxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
const proxy = {
  '/api': {
    target: proxyTarget,
    changeOrigin: true,
  },
  '/socket.io': {
    target: proxyTarget,
    ws: true,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    proxy,
  },
  preview: {
    port: Number(process.env.E2E_WEB_PORT) || 4173,
    proxy,
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
