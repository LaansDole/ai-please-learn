import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['tests/bench/**/*.test.ts', 'tests/perf/**/*.test.ts'], testTimeout: 600000, fileParallelism: false },
});
