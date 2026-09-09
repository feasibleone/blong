#!/usr/bin/env node
/**
 * Merge istanbul-format coverage maps into one unified report (lcov.info +
 * lcov-report HTML) for the repo-root `coverage/` directory.
 *
 * Why: c8's `report` only understands raw V8 coverage JSON, while
 * blong-browser's vitest emits istanbul `coverage-final.json` (c8 turns that
 * into 0% hits). Both are istanbul maps, so we merge them here and render with
 * istanbul (resolved from the c8 pnpm store) instead of c8.
 *
 * Usage:
 *   C8_BIN_DIR=<pnpm .bin dir with c8> REPO_DIR=<repo root> \
 *     node mergeCoverage.mjs <outDir> <map.json ...>
 */
import {mkdirSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const repoDir = process.env['REPO_DIR'] ?? process.cwd();
const requireBase = process.env['C8_BIN_DIR'];
if (!requireBase) {
    console.error('[mergeCoverage] C8_BIN_DIR must point at the pnpm .bin dir containing c8');
    process.exit(1);
}

const req = createRequire(resolve(requireBase, 'x.js'));
const {createCoverageMap} = req('istanbul-lib-coverage');
const {createContext} = req('istanbul-lib-report');
const reports = req('istanbul-reports');

const outDir = process.argv[2];
const inputs = process.argv.slice(3);
if (!outDir || inputs.length === 0) {
    console.error('[mergeCoverage] usage: node mergeCoverage.mjs <outDir> <map.json ...>');
    process.exit(2);
}

/** Make a file path repo-root-relative so lcov SF:/html links are stable. */
const toRel = p => {
    if (p.startsWith(repoDir + '/')) return p.slice(repoDir.length + 1);
    if (p.startsWith(repoDir)) return p.slice(repoDir.length);
    if (p.startsWith('/')) return p.replace(/^\//, '');
    return p;
};

const merged = createCoverageMap({});
for (const file of inputs) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    for (const [key, coverage] of Object.entries(data)) {
        const rel = toRel(key);
        const fixed =
            coverage && typeof coverage === 'object' ? {...coverage, path: rel} : coverage;
        merged.merge({[rel]: fixed});
    }
}

mkdirSync(outDir, {recursive: true});
const Context = createContext({
    dir: outDir,
    coverageMap: merged,
    sourceFinder: path => {
        try {
            return readFileSync(resolve(repoDir, path.replace(/^\//, '')), 'utf8');
        } catch {
            return '';
        }
    },
});
reports.create('lcov').execute(Context);
reports.create('text-summary').execute(Context);
console.log(`[mergeCoverage] wrote unified coverage into ${outDir}`);
