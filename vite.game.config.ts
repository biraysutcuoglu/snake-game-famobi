import { defineConfig } from 'vite';

// Builds the game as a single classic script (dist/game.js) that the page hands to
// GameInterface.init(). Run after the main build, which produces index.html and the CSS.
export default defineConfig({
  base: './',
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/main.ts',
      name: 'NeonSnake',
      formats: ['iife'],
      fileName: () => 'game.js'
    }
  }
});
