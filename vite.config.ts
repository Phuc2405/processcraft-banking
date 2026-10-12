import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // No source maps in production: the browser's DevTools must not be able to rebuild the original TypeScript.
    sourcemap: false,
    // The app chunk is about 1 MB (300 KB gzipped) and the 3D office is a separate chunk loaded on demand. That is expected for
    // this app, so the 500 KB advisory is raised to keep CI logs free of a warning that needs no action.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    // The store, engine and conversion tests need no browser.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
