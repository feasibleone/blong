#!/usr/bin/env node
/**
 * copy-template.mjs — bundle the `@feasibleone/blong-kopi` scaffolding
 * template into `blong-gogo/template/` at publish time.
 *
 * Runs from the `prepublishOnly` lifecycle, so it happens ONLY on `npm publish`
 * (never during normal dev). The resulting `template/` folder is git-ignored
 * and ships inside the published `@feasibleone/blong-gogo` tarball, where
 * `createRealm` (src/kopi.ts) falls back to it when the monorepo sibling
 * `core/blong-kopi` is absent.
 *
 * The copied file set is enumerated by the shared `src/template-files.ts`
 * (`listTemplateFiles`) — the SAME source `createRealm` uses, so the two can
 * never drift — PLUS `package.json` (createRealm reads it to name the realm; it
 * skips it in its own glob because it writes a copy with the name substituted).
 * Dev artifacts (node_modules, Playwright output, snapshots, Allure) are
 * excluded by the shared ignore list.
 */
import {cpSync, mkdirSync, rmSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {listTemplateFiles} from '../src/template-files.ts';

const here = dirname(fileURLToPath(import.meta.url)); // core/blong-gogo/scripts/
const gogo = join(here, '..'); // core/blong-gogo
const src = join(gogo, '..', 'blong-kopi'); // core/blong-kopi
const dest = join(gogo, 'template');

rmSync(dest, {recursive: true, force: true});
mkdirSync(dest, {recursive: true});

const files = listTemplateFiles(src, {
    extraIgnore: ['kopi.ts', 'README.md', 'CHANGELOG.md'],
});

for (const file of files) {
    const target = join(dest, file);
    mkdirSync(dirname(target), {recursive: true});
    cpSync(join(src, file), target);
}

console.log(`[blong-gogo] bundled ${files.length} template files into ${dest}`);
