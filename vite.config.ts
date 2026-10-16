import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    include: ['test/unit/**/*.test.ts']
  }
});
