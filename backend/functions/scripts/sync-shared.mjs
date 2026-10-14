// The game and the backend share one event contract. Cloud Functions deploys
// only this folder, so the single source of truth (src/shared in the game) is
// copied in at build time. The copy is git-ignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../src/shared/analyticsEvent.ts');
const target = resolve(here, '../src/shared/analyticsEvent.ts');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
