import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = ['analyticsDocument.ts', 'analyticsRequest.ts', 'analyticsStats.ts'];

for (const file of files) {
  const source = resolve(here, '../../../src/shared', file);
  const target = resolve(here, '../src/shared', file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
