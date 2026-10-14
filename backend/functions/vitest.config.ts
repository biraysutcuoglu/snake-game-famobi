import { defineConfig } from 'vitest/config';

// Without this file vitest walks up and picks up the game's root vite.config.ts,
// whose include pattern only matches the game's tests.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // The integration tests share one emulator database and each clears it first.
    fileParallelism: false
  }
});
