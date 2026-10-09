/**
 * Command-level tests for `blong-dev glossary` (commands/glossary.ts).
 *
 * The verbs are not exported individually, so each case runs the command as the CLI does, with the
 * streams captured: what is asserted is the report a caller reads and the exit code a script sees.
 */

import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {GLOSSARY_END, GLOSSARY_START} from '../glossary/glossaryDoc.ts';
import {glossary} from './glossary.ts';

const EMPTY = ['# Glossary', '', 'Intro.', '', GLOSSARY_START, '', GLOSSARY_END, ''].join('\n');

interface ICaptured {
    out: string;
    err: string;
    /** The exit code the command set, or `undefined` when it set none. */
    code: number | undefined;
}

/** Run the command with its streams captured. */
async function capture(args: string[]): Promise<ICaptured> {
    const out: string[] = [];
    const err: string[] = [];
    const originalOut = process.stdout.write;
    const originalErr = process.stderr.write;
    const previousCode = process.exitCode;
    process.exitCode = undefined;
    process.stdout.write = ((chunk: unknown): boolean => {
        out.push(String(chunk));
        return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: unknown): boolean => {
        err.push(String(chunk));
        return true;
    }) as typeof process.stderr.write;
    try {
        await glossary(args);
        return {out: out.join(''), err: err.join(''), code: process.exitCode};
    } finally {
        process.stdout.write = originalOut;
        process.stderr.write = originalErr;
        process.exitCode = previousCode;
    }
}

/** A throwaway glossary, with a resolvable link target. */
function fixture(text = EMPTY): {file: string; dispose: () => void} {
    const dir = mkdtempSync(join(tmpdir(), 'blong-dev-glossary-cli-'));
    const file = join(dir, 'glossary.md');
    writeFileSync(file, text);
    writeFileSync(join(dir, 'chain.md'), '# Chain\n');
    return {file, dispose: () => rmSync(dir, {recursive: true, force: true})};
}

test('add inserts a term in sorted position and the file passes check', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    await capture(['add', 'zulu', '--definition', 'Last. See [link](./chain.md).', '--file', file]);
    const result = await capture([
        'add',
        'alpha',
        '--definition',
        'First. See [link](./chain.md).',
        '--file',
        file,
    ]);
    t.match(result.out, /# glossary add: added "alpha" \(2 entries\)/, 'reports the insert');
    t.equal(result.code, undefined, 'a clean add exits zero');
    t.match(
        readFileSync(file, 'utf8'),
        /\*\*alpha\*\* — First.*\n\n\*\*zulu\*\* — Last/s,
        'alpha lands before zulu',
    );
    t.match((await capture(['check', '--file', file])).out, /2 entries in order/, 'check passes');
    t.end();
});

test('add updates a term that is already present instead of duplicating it', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    await capture(['add', 'chain', '--definition', 'One. See [link](./chain.md).', '--file', file]);
    const result = await capture([
        'add',
        'CHAIN',
        '--definition',
        'Two. See [link](./chain.md).',
        '--file',
        file,
    ]);
    t.match(result.out, /# glossary add: updated "CHAIN" \(1 entries\)/, 'reports the update');
    t.match(readFileSync(file, 'utf8'), /Two\. See/, 'the definition is replaced');
    t.notMatch(readFileSync(file, 'utf8'), /One\. See/, 'the old definition is gone');
    t.end();
});

test('add rejects a term that is not a word', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const result = await capture(['add', 'bad_term', '--definition', 'x', '--file', file]);
    t.equal(result.code, 1, 'a bad term exits 1');
    t.match(result.err, /is not a term/, 'and says why');
    t.end();
});

test('remove drops a term and reports the one that was not there', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    await capture(['add', 'chain', '--definition', 'One. See [link](./chain.md).', '--file', file]);
    const result = await capture(['remove', 'chain', 'notthere', '--file', file]);
    t.match(result.out, /# glossary remove: removed chain \(0 entries\)/, 'reports the removal');
    t.match(result.out, /# glossary remove: no such term: notthere/, 'reports the miss');
    t.end();
});

test('list prints the terms and show prints one entry', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    await capture(['add', 'chain', '--definition', 'One. See [link](./chain.md).', '--file', file]);
    t.equal((await capture(['list', '--file', file])).out, 'chain\n', 'list is the bare terms');
    const shown = await capture(['show', 'chain', '--file', file]);
    t.match(shown.out, /^\*\*chain\*\* — One\./, 'show renders the entry');
    const json = await capture(['show', 'chain', '--json', '--file', file]);
    t.match(json.out, /"term": "chain"/, 'json includes the term');
    t.end();
});

test('show reports a term the glossary does not hold', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const result = await capture(['show', 'missing', '--file', file]);
    t.equal(result.code, 1, 'a miss exits 1');
    t.match(result.err, /no such term: missing/, 'and names the term');
    t.end();
});

test('check fails on an unsorted file and leaves it alone', async t => {
    const file = fixture(
        [
            '# Glossary',
            '',
            GLOSSARY_START,
            '',
            '**zulu** — One. See [link](./chain.md).',
            '',
            '**alpha** — Two. See [link](./chain.md).',
            '',
            GLOSSARY_END,
            '',
        ].join('\n'),
    );
    t.teardown(file.dispose);
    const before = readFileSync(file.file, 'utf8');
    const result = await capture(['check', '--file', file.file]);
    t.equal(result.code, 1, 'an unsorted file exits 1');
    t.match(result.out, /# glossary check: not sorted: "alpha" follows "zulu"/, 'names the pair');
    t.equal(readFileSync(file.file, 'utf8'), before, 'check writes nothing');
    t.end();
});

test('sort puts an unsorted file back in order', async t => {
    const {file, dispose} = fixture(
        [
            '# Glossary',
            '',
            GLOSSARY_START,
            '',
            '**zulu** — One. See [link](./chain.md).',
            '',
            '**alpha** — Two. See [link](./chain.md).',
            '',
            GLOSSARY_END,
            '',
        ].join('\n'),
    );
    t.teardown(dispose);
    const result = await capture(['sort', '--file', file]);
    t.match(result.out, /# glossary sort: 2 entries reordered/, 'reports the reorder');
    t.match(readFileSync(file, 'utf8'), /\*\*alpha\*\*[\s\S]*\*\*zulu\*\*/, 'alpha comes first');
    t.equal((await capture(['check', '--file', file])).code, undefined, 'check now passes');
    t.end();
});
