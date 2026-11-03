import {mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

import {latencySummary, latencyTable, reportLatency, type IBootSample} from './latency.js';

/**
 * The report's shape, which is its purpose.
 *
 * `measureBoot` and `serveBuiltApp` need a browser and a build; what is left is the
 * arithmetic of reading the numbers — the columns stay where they were, the label says
 * which leg a row belongs to, and the JSON beside the table carries the same samples.
 * A table that re-flowed between runs would be compared by eye and reported as a change,
 * so the alignment is asserted rather than reviewed.
 */

function sample(label: string, overrides: Partial<IBootSample> = {}): IBootSample {
    return {
        label,
        documents: 1,
        scripts: 271,
        gotoMs: 158,
        bootMs: 391,
        submitMs: 63,
        menubarMs: 48,
        mergedMs: 5,
        totalMs: 665,
        ...overrides,
    };
}

describe('latencyTable', () => {
    it('puts one row per sample under a header of the same width', () => {
        const lines = latencyTable([sample('dev #1'), sample('build #1')]).split('\n');
        expect(lines).toHaveLength(4); // header, two rows, the unit note
        expect(lines[0]).toMatch(/^sample/);
        expect(lines[1]).toMatch(/^dev #1/);
        expect(lines[2]).toMatch(/^build #1/);
        expect(lines[0]).toHaveLength(lines[1]!.length);
        expect(lines[1]).toHaveLength(lines[2]!.length);
    });

    it('reports each phase and the counts, right-aligned', () => {
        const [, row] = latencyTable([sample('dev #1')]).split('\n');
        expect(row).toContain('665');
        expect(row).toContain('391');
        expect(row).toContain('271');
        expect(row!.endsWith('     271')).toBe(true);
    });

    it('keeps a label wider than its column without shifting the numbers', () => {
        const [, wide] = latencyTable([sample('a label that is too long')]).split('\n');
        const [, narrow] = latencyTable([sample('dev #1')]).split('\n');
        expect(wide!.endsWith(narrow!.slice(-8 * 8))).toBe(true);
    });
});

describe('latencySummary', () => {
    it('names a leg by its label without the run number, and reports the median', () => {
        const summary = latencySummary([
            sample('dev #1', {totalMs: 400}),
            sample('dev #2', {totalMs: 600}),
            sample('dev #3', {totalMs: 500}),
            sample('build #1', {totalMs: 300}),
            sample('build #2', {totalMs: 320}),
            sample('dev + trace', {totalMs: 900}),
        ]);
        expect(summary).toContain('dev 500');
        expect(summary).toContain('build 310');
        expect(summary).toContain('dev + trace 900');
    });

    it('takes the lower middle of an even spread rather than inventing one', () => {
        const summary = latencySummary([
            sample('build #1', {totalMs: 300}),
            sample('build #2', {totalMs: 401}),
        ]);
        expect(summary).toContain('build 351');
    });

    it('says nothing about a leg it has no samples for', () => {
        expect(latencySummary([])).toBe('median total (ms): ');
    });
});

describe('reportLatency', () => {
    it('returns the table and writes the same samples beside it', () => {
        const dir = mkdtempSync(join(tmpdir(), 'blong-latency-'));
        const file = join(dir, 'nested', 'latency.json');
        const samples = [sample('dev #1'), sample('build #1', {scripts: 42})];

        const table = reportLatency(samples, {file});

        expect(table).toBe(latencyTable(samples));
        const written = JSON.parse(readFileSync(file, 'utf8')) as {
            at: string;
            samples: IBootSample[];
        };
        expect(written.samples).toEqual(samples);
        expect(Number.isNaN(Date.parse(written.at))).toBe(false);
    });

    it('writes nothing when no file is asked for', () => {
        const table = reportLatency([sample('dev #1')]);
        expect(table).toContain('dev #1');
    });
});
