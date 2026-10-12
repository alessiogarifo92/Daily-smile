import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'web',
  publicDir: 'public',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts', 'worker/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.ts', 'web/src/prefs.ts', 'web/src/composition.ts', 'web/src/timeInput.ts', 'web/src/sprites.ts', 'web/src/push.ts', 'worker/src/**/*.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
