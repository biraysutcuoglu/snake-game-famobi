// Writes the uncompressed size of dist/game.js into dist/boot.js. Servers usually compress
// the bundle, which hides its real size from Content-Length, and boot.js needs that size
// to turn downloaded bytes into a preload percentage.
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const size = statSync('dist/game.js').size;
const boot = readFileSync('dist/boot.js', 'utf8');
if (!boot.includes('__GAME_SIZE__')) throw new Error('dist/boot.js has no __GAME_SIZE__ placeholder.');
writeFileSync('dist/boot.js', boot.replace('__GAME_SIZE__', String(size)));
console.log(`Injected game.js size (${size} bytes) into dist/boot.js`);
