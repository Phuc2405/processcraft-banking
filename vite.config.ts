import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // No source maps in production: the browser's DevTools must not be able to rebuild the original TypeScript.
    sourcemap: false,
    // The app chunk is about 900 KB (300 KB gzipped); the 3D office and the heavy modals are lazy chunks.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // React, React Flow and Zustand change far less often than the app: their own chunk stays cached across deploys.
        // The Vietnamese text tables and the analyst-workspace copy are chunks of their own, so the app chunk stays under the limit.
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store|@xyflow|classcat|d3-[a-z]+)[\\/]/ },
            { name: 'i18n-vi', test: /[\\/]src[\\/](i18n[\\/](academyVi|challengeVi|catalogVi|feedVi|notesVi|reportVi|factsVi|simVi|viDictionary)\.ts|sim[\\/](learningVi|lessonExtras)\.ts)$/ },
            { name: 'workspace-copy', test: /[\\/]src[\\/]components[\\/]bank[\\/]analystWorkspace\.messages\.ts$/ },
          ],
        },
      },
    },
  },
  test: {
    // The store, engine and conversion tests need no browser.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Quiet runs: a dot a test and the summary, with full diffs only for failures; no console output from the tests.
    reporters: ['dot'],
    silent: true,
    // The month-long and frame-by-frame simulation tests take a second or two alone, but can take over 20 seconds when every
    // file runs in parallel on a many-core machine; the limit only decides how long a stuck test takes to fail.
    testTimeout: 60_000,
  },
});
