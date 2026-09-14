import {appendFileSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import t from 'tap';
import type {LogRecord} from './record.ts';
import {createFanoutWriter, getWriter, setWriter, stderrWriter, stdoutWriter, type Writer} from './writer.ts';

t.test('the destination defaults to stdout before anything is installed', t => {
    // Nothing has called `setWriter` in this process, so the never-installed
    // state must read as stdout: it is what makes zero-configuration usage emit
    // with no setup at all (PRD R18).
    t.equal(getWriter(), stdoutWriter);
    t.end();
});

t.test('installing a writer replaces the destination, and null silences', t => {
    const written: string[] = [];
    const custom = {write: (line: string): void => void written.push(line)};
    setWriter(custom);
    t.equal(getWriter(), custom, 'an installed writer wins');
    setWriter(null);
    t.equal(getWriter(), null, 'null is an explicit silence, not a fall-through to stdout');
    setWriter(stdoutWriter);
    t.end();
});

t.test('the built-in writers forward a line to their own stream', t => {
    // The real sinks are observed rather than avoided: every chunk is captured
    // and the original write is not reached, so the test runner's own stdout
    // stays untouched while the forwarding itself is under test.
    const originalOut = process.stdout.write;
    const originalErr = process.stderr.write;
    const out: string[] = [];
    const err: string[] = [];
    process.stdout.write = ((chunk: unknown): boolean => {
        out.push(String(chunk));
        return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown): boolean => {
        err.push(String(chunk));
        return true;
    }) as typeof process.stderr.write;
    try {
        stdoutWriter.write('to stdout\n');
        stderrWriter.write('to stderr\n');
    } finally {
        process.stdout.write = originalOut;
        process.stderr.write = originalErr;
    }
    t.same(out, ['to stdout\n'], 'stdoutWriter targets stdout');
    t.same(err, ['to stderr\n'], 'stderrWriter targets stderr');
    t.end();
});

t.test('a fan-out writes the same line, and the same record, to every destination', t => {
    const first: string[] = [];
    const second: string[] = [];
    const forwarded: unknown[] = [];
    const record = {id: '01J8Z9K2M9PQRSTVWXYZ0A1B2C'} as unknown as LogRecord;
    const fanout = createFanoutWriter([
        {
            write: (line: string, received?: LogRecord): void => {
                first.push(line);
                forwarded.push(received);
            },
        },
        {write: (line: string): void => void second.push(line)},
    ]);
    fanout.write('one line\n', record);
    t.same(first, ['one line\n'], 'the first destination received the line');
    t.same(second, ['one line\n'], 'the second destination received the same line');
    t.equal(
        forwarded[0],
        record,
        'the structured record rides beside the line, so a structured sink needs no re-parsing',
    );
    t.end();
});

t.test('one failing destination neither blocks nor suppresses the others', t => {
    const dead = (): Writer => ({
        write: (): void => {
            throw new Error('this sink is down');
        },
    });
    const survive = (lines: string[]): Writer => ({write: (line: string): void => void lines.push(line)});

    // N=2: the failure is the *first* destination, so a fan-out that stopped at
    // the first throw would leave the survivor empty.
    const two: string[] = [];
    t.doesNotThrow(
        () => createFanoutWriter([dead(), survive(two)]).write('n2\n'),
        'a throw from one of two destinations does not escape',
    );
    t.same(two, ['n2\n'], 'the surviving destination still received the line');

    // N=3 with two dead: one failure must not consume the isolated slot for the
    // other, which a single try around the whole loop would.
    const three: string[] = [];
    t.doesNotThrow(
        () => createFanoutWriter([dead(), dead(), survive(three)]).write('n3\n'),
        'two dead destinations of three do not escape either',
    );
    t.same(three, ['n3\n'], 'the one living destination still received the line');
    t.end();
});

t.test('a file destination and an in-memory one receive the line together', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'semantic-log-fanout-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const file = join(dir, 'fanout.log');
    const memory: string[] = [];
    createFanoutWriter([
        {write: (line: string): void => void appendFileSync(file, line)},
        {write: (line: string): void => void memory.push(line)},
    ]).write('to both\n');
    t.equal(await readFile(file, 'utf8'), 'to both\n', 'the file destination was written');
    t.same(memory, ['to both\n'], 'the in-memory destination was written in parallel');
});
