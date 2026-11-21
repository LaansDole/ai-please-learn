import { defineConfig } from 'vitest/config';
export default defineConfig({
  // silent: false keeps report() lines visible when Vitest auto-silences passing tests (CI / agent runs).
  test: { environment: 'node', include: ['tests/bench/**/*.test.ts', 'tests/perf/**/*.test.ts'], testTimeout: 600000, fileParallelism: false, silent: false },
});
