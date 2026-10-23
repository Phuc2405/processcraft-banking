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
    rolldownOptions: {
      output: {
        // React, React Flow and Zustand change far less often than the app: their own chunk stays cached across deploys.
        // The Vietnamese text tables (lessons, levels, glossary, feed and grader wording) are a chunk of their own too, so
        // the app chunk stays under the limit with every screen available in both languages.
        advancedChunks: {
          groups: [
            { name: 'vendor', test: /node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store|@xyflow|classcat|d3-[a-z]+)[\\/]/ },
            { name: 'i18n-vi', test: /[\\/]src[\\/](i18n[\\/](academyVi|challengeVi|catalogVi|feedVi|notesVi|reportVi|factsVi|simVi|viDictionary)\.ts|sim[\\/](learningVi|lessonExtras)\.ts)$/ },
          ],
        },
      },
    },
  },
  test: {
    // The store, engine and conversion tests need no browser.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
