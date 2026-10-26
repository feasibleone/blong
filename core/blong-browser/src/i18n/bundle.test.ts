/**
 * The bundle boundary, checked rather than remembered.
 *
 * The collector must be in the app bundle (`useText` records through it), while
 * the seed writer must not be: it imports `node:fs`, and a bundler that reached it
 * would fail the browser build. `package.json` exposes the two halves as separate
 * entries (`.` and `./playwright*`), and this test walks the static import graph
 * from `src/index.ts` to prove the app half cannot reach the other (`D-633`,
 * `T-426`).
 */
import {existsSync, readFileSync} from 'node:fs';
import {dirname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

// This file lives in `src/i18n`, so the app entry is one level up.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Resolve an import specifier written in `from` relative to the importing file. */
function resolveSpecifier(specifier: string, from: string): string | undefined {
    if (!specifier.startsWith('.')) return undefined;
    const base = resolve(dirname(from), specifier);
    for (const candidate of [
        base.replace(/\.js$/, '.ts'),
        base.replace(/\.js$/, '.tsx'),
        `${base}.ts`,
        `${base}.tsx`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
    ]) {
        if (existsSync(candidate)) return candidate;
    }
    return undefined;
}

/** Every local module reachable from `entry` by a static import or re-export. */
function importGraph(entry: string): Set<string> {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
            const specifier = match[1];
            if (specifier.startsWith('node:')) {
                throw new Error(`${relative(SRC, file)} imports ${specifier}`);
            }
            const local = resolveSpecifier(specifier, file);
            if (local) queue.push(local);
        }
    }
    return seen;
}

describe('app bundle boundary', () => {
    it('reaches no node builtin and no playwright module from src/index.ts', () => {
        // `importGraph` throws on the first `node:` specifier it meets.
        const graph = importGraph(resolve(SRC, 'index.ts'));
        expect(graph.size).toBeGreaterThan(10);
        expect([...graph].some(file => /playwright[\\/]translate\.ts$/.test(file))).toBe(false);
        expect([...graph].some(file => /i18n[\\/]collect\.ts$/.test(file))).toBe(true);
    });
});
