import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // The data-access tests start an in-process Postgres and run every migration; allow for a busy machine.
    testTimeout: 20_000,
    hookTimeout: 30_000, include: ['src/**/*.test.ts', 'evals/**/*.test.ts'], setupFiles: ['src/test/setup.ts'] },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
});
