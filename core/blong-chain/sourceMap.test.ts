/**
 * Browser source-map resolution for captured stack positions.
 *
 * The Vite plugin registers a map under the module's URL; the executor asks for the original
 * position of the generated line and column. The decoder is the whole contract here: a segment
 * table is easy to read wrong, and a wrong answer becomes a source link that opens the wrong line.
 */
import assert from 'assert';
import tap from 'tap';
import {mapSourcePosition, type IRegisteredSourceMap} from './sourceMap.ts';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encode one segment's signed values, for a hand-written map in the assertions below. */
function segment(values: number[]): string {
    return values
        .map(value => {
            let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
            let encoded = '';
            do {
                let digit = vlq & 31;
                vlq >>>= 5;
                if (vlq > 0) digit |= 32;
                encoded += BASE64[digit];
            } while (vlq > 0);
            return encoded;
        })
        .join('');
}

const registry = globalThis as {__BLONG_SOURCE_MAPS__?: Record<string, IRegisteredSourceMap>};

function register(file: string, mappings: string): void {
    registry.__BLONG_SOURCE_MAPS__ = {
        [file]: {version: 3, sources: ['step.ts'], mappings},
    };
}

tap.test('mapSourcePosition', async t => {
    t.teardown(() => {
        delete registry.__BLONG_SOURCE_MAPS__;
    });

    t.test('returns the captured position when no map is registered', async () => {
        delete registry.__BLONG_SOURCE_MAPS__;
        assert.deepEqual(mapSourcePosition('http://localhost/test/a.ts', 12, 7), {
            line: 12,
            column: 7,
        });
    });

    t.test('maps a generated segment back to the authored line and column', async () => {
        register(
            'http://localhost:5173/s/browser/test/test/step.ts',
            [segment([0, 0, 0, 0]), segment([10, 0, 4, 20])].join(','),
        );
        assert.deepEqual(
            mapSourcePosition('http://localhost:5173/s/browser/test/test/step.ts', 1, 1),
            {line: 1, column: 1},
        );
        assert.deepEqual(
            mapSourcePosition('http://localhost:5173/s/browser/test/test/step.ts', 1, 11),
            {line: 5, column: 21},
        );
    });

    t.test('accumulates line deltas across generated lines', async () => {
        register(
            'http://localhost:5173/s/browser/test/test/step.ts',
            [segment([0, 0, 0, 0]), segment([0, 0, 3, 2])].join(';'),
        );
        assert.deepEqual(
            mapSourcePosition('http://localhost:5173/s/browser/test/test/step.ts', 2, 1),
            {line: 4, column: 3},
        );
    });

    t.test('finds the map when the stack omits the origin', async () => {
        register('http://localhost:5173/s/browser/test/test/step.ts', segment([0, 0, 0, 0]));
        assert.deepEqual(mapSourcePosition('/s/browser/test/test/step.ts', 1, 1), {
            line: 1,
            column: 1,
        });
    });

    t.test('leaves a position without a covering segment unchanged', async () => {
        register('http://localhost:5173/s/browser/test/test/step.ts', segment([0, 0, 0, 0]));
        assert.deepEqual(
            mapSourcePosition('http://localhost:5173/s/browser/test/test/step.ts', 2, 1),
            {line: 2, column: 1},
        );
    });

    t.test('leaves a position unchanged when the file has no map', async () => {
        register('http://localhost:5173/s/browser/test/test/other.ts', segment([0, 0, 0, 0]));
        assert.deepEqual(
            mapSourcePosition('http://localhost:5173/s/browser/test/test/step.ts', 1, 1),
            {line: 1, column: 1},
        );
    });

    t.test('skips empty, unmapped and malformed segments', async () => {
        register(
            'http://localhost:5173/s/browser/test/test/step.ts',
            [segment([0, 0, 0, 0]), '', segment([5]), '!', segment([0, 0, 2, 4])].join(','),
        );
        assert.deepEqual(
            mapSourcePosition('http://localhost:5173/s/browser/test/test/step.ts', 1, 6),
            {line: 3, column: 5},
        );
    });

    t.test('decodes a negative delta and a name index', async () => {
        register(
            'http://localhost:5173/s/browser/test/test/step.ts',
            [segment([0, 0, 0, 10]), segment([10, 0, 2, -5, 0])].join(','),
        );
        assert.deepEqual(
            mapSourcePosition('http://localhost:5173/s/browser/test/test/step.ts', 1, 11),
            {line: 3, column: 6},
        );
    });

    t.test('does not map a segment that starts after the generated column', async () => {
        register('http://localhost:5173/s/browser/test/test/step.ts', segment([10, 0, 5, 5]));
        assert.deepEqual(
            mapSourcePosition('http://localhost:5173/s/browser/test/test/step.ts', 1, 5),
            {line: 1, column: 5},
        );
    });

    t.test('walks empty generated lines before the target', async () => {
        register(
            'http://localhost:5173/s/browser/test/test/step.ts',
            [segment([0, 0, 0, 0]), '', segment([0, 0, 1, 0])].join(';'),
        );
        assert.deepEqual(
            mapSourcePosition('http://localhost:5173/s/browser/test/test/step.ts?import', 3, 1),
            {line: 2, column: 1},
        );
    });
});
