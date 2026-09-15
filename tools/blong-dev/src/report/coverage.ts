/**
 * Coverage as reported by the aggregated `coverage/lcov.info` produced by
 * `core/blong-gogo/run-coverage.sh` (`rush ci-coverage`).
 */

import {existsSync, readFileSync} from 'node:fs';

/** Category folders that sit above a package folder in this repository. */
const CATEGORIES = new Set(['app', 'core', 'ext', 'library', 'realm', 'suite', 'demo', 'test', 'tools']);

export interface ILinesCoverage {
    hit: number;
    found: number;
}

export interface ICoverage {
    /** Totals across every file in the lcov report. */
    lines: ILinesCoverage;
    /** Per-package line coverage, keyed by package folder name. */
    packages: Map<string, ILinesCoverage>;
}

/** `core/blong-gogo/src/x.ts` → `blong-gogo`; `realm/blong-access/y.ts` → `blong-access`. */
export function packageOfSourceFile(source: string): string {
    const parts = source.split('/');
    return CATEGORIES.has(parts[0] ?? '') ? (parts[1] ?? parts[0] ?? '') : (parts[0] ?? '');
}

/** Parse an lcov report into repo totals plus a per-package breakdown. */
export function parseLcov(content: string): ICoverage {
    const lines: ILinesCoverage = {hit: 0, found: 0};
    const packages = new Map<string, ILinesCoverage>();
    let current: string | null = null;

    for (const line of content.split('\n')) {
        if (line.startsWith('SF:')) {
            current = packageOfSourceFile(line.slice(3));
            if (!packages.has(current)) packages.set(current, {hit: 0, found: 0});
        } else if (line.startsWith('LF:')) {
            const found = Number(line.slice(3)) || 0;
            lines.found += found;
            const entry = current ? packages.get(current) : undefined;
            if (entry) entry.found += found;
        } else if (line.startsWith('LH:')) {
            const hit = Number(line.slice(3)) || 0;
            lines.hit += hit;
            const entry = current ? packages.get(current) : undefined;
            if (entry) entry.hit += hit;
        }
    }

    return {lines, packages};
}

/** Read and parse an lcov report, returning `null` when it is not there. */
export function readLcov(file: string): ICoverage | null {
    return existsSync(file) ? parseLcov(readFileSync(file, 'utf8')) : null;
}

/** Percentage with one decimal, or `0` when nothing was measured. */
export function lineCoveragePct(coverage: ILinesCoverage): number {
    return coverage.found > 0 ? Math.round((coverage.hit / coverage.found) * 1000) / 10 : 0;
}
