// The game and the backend share the event and stats contracts. Cloud Functions deploys
// only this folder, so the single source of truth (src/shared in the game) is
// copied in at build time. The copy is git-ignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = ['analyticsEvent.ts', 'analyticsStats.ts'];

for (const file of files) {
  const source = resolve(here, '../../../src/shared', file);
  const target = resolve(here, '../src/shared', file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
