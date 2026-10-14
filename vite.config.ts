import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    // The backend has its own test setup (backend/functions) that needs the emulators.
    include: ['src/**/*.test.ts']
  }
});
