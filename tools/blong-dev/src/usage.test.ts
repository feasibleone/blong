/**
 * Unit tests for the shared `blong-dev` CLI usage text (usage.ts).
 *
 * The `cli.ts` entry itself is not imported (it dispatches commands and exits
 * the process); the pure usage helpers are tested here.
 */

import {test} from 'tap';

import {USAGE_LINES, writeUnknownCommand, writeUsage} from './usage.ts';

test('USAGE_LINES lists every subcommand including sql', async t => {
    for (const sub of ['lint', 'test', 'playwright', 'proxy', 'trace', 'log', 'sql']) {
        t.ok(
            USAGE_LINES.some(line => line.includes(`blong-dev ${sub}`)),
            `lists blong-dev ${sub}`,
        );
    }
    t.end();
});

test('writeUsage writes a Usage: header followed by the command lines', async t => {
    let out = '';
    const stream = {
        write: (s: string) => {
            out += s;
            return true;
        },
    } as unknown as NodeJS.WriteStream;
    writeUsage(stream);
    t.match(out, /^Usage:\n/, 'header first');
    t.match(out, /blong-dev sql/, 'includes sql');
    t.end();
});

test('writeUnknownCommand prefixes the error before usage', async t => {
    let out = '';
    const stream = {
        write: (s: string) => {
            out += s;
            return true;
        },
    } as unknown as NodeJS.WriteStream;
    writeUnknownCommand(stream, 'nope');
    t.match(out, /^blong-dev: Unknown command "nope"\n/, 'error first');
    t.match(out, /Usage:\n/, 'usage follows');
    t.end();
});
