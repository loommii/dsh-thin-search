import { defineConfig } from 'vitest/config'

/** Host and client unit tests; host-only runs pass a path filter to vitest. */
export default defineConfig({
  test: {
    include: [
      'test/host/**/*.test.ts',
      'test/client/**/*.test.ts',
      'test/client/**/*.test.tsx',
      'test/integration/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    restoreMocks: true,
  },
})
