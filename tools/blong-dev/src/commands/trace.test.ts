/**
 * Unit tests for the trace-chunk discovery behind `blong-dev trace`.
 *
 * Playwright writes a trace in numbered chunks, and the command used to read only `0-trace.trace`:
 * a run whose first chunk was `1-trace.trace` printed an empty timeline, which reads as a test that
 * did nothing rather than as a trace that was not found. Both halves of that mistake are covered
 * here — every chunk is discovered in order, and a directory with no chunk is distinguishable from
 * one whose chunks are empty.
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';

import {traceChunks} from './trace.ts';

const makeDir = (files: string[]): string => {
    const dir = join(
        tmpdir(),
        `blong-trace-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(dir, {recursive: true});
    for (const name of files) {
        const full = join(dir, name);
        mkdirSync(join(full, '..'), {recursive: true});
        writeFileSync(full, '');
    }
    return dir;
};

t.test('traceChunks finds every numbered chunk, in order', t => {
    const dir = makeDir([
        '1-trace.trace',
        '0-trace.trace',
        '2-trace.trace',
        '0-trace.network',
        '1-trace.network',
        'resources/1-trace.trace',
    ]);
    t.same(
        traceChunks(dir, 'trace').map(f => f.split('/').pop()),
        ['0-trace.trace', '1-trace.trace', '2-trace.trace'],
        'all trace chunks, numerically sorted — the chunk that used to be missed is included',
    );
    t.same(
        traceChunks(dir, 'network').map(f => f.split('/').pop()),
        ['0-trace.network', '1-trace.network'],
        'the network log is chunked the same way',
    );
    t.end();
});

t.test('traceChunks reports nothing rather than inventing a path', t => {
    const empty = makeDir([]);
    t.same(traceChunks(empty, 'trace'), [], 'a directory with no chunk yields no files');
    t.same(
        traceChunks(join(empty, 'does-not-exist'), 'trace'),
        [],
        'a directory that cannot be read yields no files instead of throwing',
    );
    const other = makeDir(['0-trace.trace', 'trace.zip', 'trace.trace', 'x-trace.trace']);
    t.same(
        traceChunks(other, 'trace').map(f => f.split('/').pop()),
        ['0-trace.trace'],
        'a zip, an unnumbered name and a non-numeric prefix are not chunks',
    );
    t.end();
});
