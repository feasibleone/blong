/**
 * Command-level tests for `blong-dev cspell` (commands/cspell.ts).
 *
 * The verbs are not exported individually, so each case runs the command as the
 * CLI does, with the streams captured: what is asserted is the report a caller
 * reads and the exit code a script sees.
 */

import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {CSPELL_CONFIG_FILE} from '../cspell/cspellConfig.ts';
import {cspell} from './cspell.ts';

const UNSORTED = [
    'version: "0.2"',
    'words:',
    '  - zustand',
    '  - blong',
    'ignorePaths:',
    '  - package-lock.json',
    '  - "**/*.json"',
    '',
].join('\n');

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
        await cspell(args);
        return {out: out.join(''), err: err.join(''), code: process.exitCode};
    } finally {
        process.stdout.write = originalOut;
        process.stderr.write = originalErr;
        process.exitCode = previousCode;
    }
}

/** A throwaway config, with its directory for the tree cases. */
function fixture(text = UNSORTED): {dir: string; file: string; dispose: () => void} {
    const dir = mkdtempSync(join(tmpdir(), 'blong-dev-cspell-cli-'));
    const file = join(dir, CSPELL_CONFIG_FILE);
    writeFileSync(file, text);
    return {dir, file, dispose: () => rmSync(dir, {recursive: true, force: true})};
}

test('add inserts a word, in sorted position', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const result = await capture(['add', 'kukum', '--file', file]);
    t.match(result.out, /# cspell add: words \+= kukum \(3 entries\)/, 'reports the insert');
    t.equal(result.code, undefined, 'a clean add exits zero');
    t.match(
        readFileSync(file, 'utf8'),
        /  - blong\n  - kukum\n  - zustand\n/,
        'the word lands between blong and zustand',
    );
    t.end();
});

test('add reports a word that is already there and writes nothing', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const before = readFileSync(file, 'utf8');
    const result = await capture(['add', 'blong', '--file', file]);
    t.match(result.out, /# cspell add: words already has blong/, 'reports the duplicate');
    t.equal(readFileSync(file, 'utf8'), before, 'the file is untouched');
    t.end();
});

test('add targets ignorePaths with --section and quotes the glob', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const result = await capture([
        'add',
        'core/**/fixture/**',
        '--section',
        'ignorePaths',
        '--file',
        file,
    ]);
    t.match(result.out, /# cspell add: ignorePaths \+= core/, 'reports the section');
    t.match(readFileSync(file, 'utf8'), /  - core\/\*\*\/fixture\/\*\*/, 'the glob is written');
    t.end();
});

test('remove drops a word and reports the one that was not there', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const result = await capture(['remove', 'blong', 'notthere', '--file', file]);
    t.match(result.out, /# cspell remove: words -= blong \(1 entries\)/, 'reports the removal');
    t.match(result.out, /# cspell remove: words has no notthere/, 'reports the miss');
    t.end();
});

test('check fails on an unsorted list and leaves the file alone', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const before = readFileSync(file, 'utf8');
    const result = await capture(['check', '--file', file]);
    t.equal(result.code, 1, 'an unsorted file is a failure');
    t.match(
        result.out,
        /# cspell check: words is not sorted: "blong" follows "zustand"/,
        'names it',
    );
    t.match(result.err, /run `blong-dev cspell sort`/, 'says what to do');
    t.equal(readFileSync(file, 'utf8'), before, 'check never writes');
    t.end();
});

test('sort orders every maintained section, and check then passes', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const result = await capture(['sort', '--file', file]);
    t.match(result.out, /# cspell sort: words \(2 entries\) reordered/, 'reports the words');
    t.match(result.out, /# cspell sort: ignorePaths \(2 entries\) reordered/, 'reports the paths');
    t.match(readFileSync(file, 'utf8'), /words:\n  - blong\n  - zustand\n/, 'words are sorted');
    t.match(
        readFileSync(file, 'utf8'),
        /ignorePaths:\n  - "\*\*\/\*\.json"\n  - package-lock\.json\n/,
        'paths are sorted by code unit',
    );
    const after = await capture(['check', '--file', file]);
    t.equal(after.code, undefined, 'the file now passes');
    t.match(after.out, /# cspell check: words \(2\), ignorePaths \(2\) sorted/, 'and says so');
    t.end();
});

test('sort says so when there is nothing to do', async t => {
    const {file, dispose} = fixture('version: "0.2"\nwords:\n  - blong\n');
    t.teardown(dispose);
    const before = readFileSync(file, 'utf8');
    const result = await capture(['sort', '--section', 'words', '--file', file]);
    t.match(result.out, /# cspell sort: words \(1\) already sorted/, 'no change is reported');
    t.equal(readFileSync(file, 'utf8'), before, 'and none is written');
    t.end();
});

test('json output carries the report a script reads', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const added = await capture(['add', 'kukum', '--file', file, '--json']);
    t.same(
        JSON.parse(added.out),
        {file, section: 'words', added: ['kukum'], present: [], entries: 3},
        'add',
    );
    const listed = await capture(['list', '--section', 'words', '--json', '--file', file]);
    t.same(
        JSON.parse(listed.out),
        {file, sections: {words: ['blong', 'kukum', 'zustand']}},
        'list',
    );
    await capture(['sort', '--file', file]);
    const checked = await capture(['check', '--json', '--file', file]);
    t.equal(checked.code, undefined, 'the file is clean by now');
    t.same(
        JSON.parse(checked.out),
        {
            file,
            ok: true,
            sections: [
                {section: 'words', entries: 3, sorted: true, duplicates: []},
                {section: 'ignorePaths', entries: 2, sorted: true, duplicates: []},
            ],
        },
        'check',
    );
    t.end();
});

test('list prints the entries of the requested sections', async t => {
    const {file, dispose} = fixture();
    t.teardown(dispose);
    const result = await capture(['list', '--section', 'words', '--file', file]);
    t.equal(
        result.out,
        '# cspell list: words (2 entries)\nzustand\nblong\n',
        'entries one per line',
    );
    t.end();
});

test('the config is found by walking up from the working directory', async t => {
    const {dir, dispose} = fixture();
    const nested = join(dir, 'packages', 'inner');
    mkdirSync(nested, {recursive: true});
    const previous = process.cwd();
    process.chdir(nested);
    t.teardown(() => {
        process.chdir(previous);
        dispose();
    });
    const result = await capture(['check']);
    t.equal(result.code, 1, 'the repository config is found and checked');
    t.match(result.out, /words is not sorted/, 'and it is the one that was checked');
    t.end();
});

test('a caller mistake reports usage and exits non-zero', async t => {
    const {dir, dispose} = fixture('version: "0.2"\n');
    const previous = process.cwd();
    process.chdir(dir);
    t.teardown(() => {
        process.chdir(previous);
        dispose();
    });
    const cases: [string[], RegExp][] = [
        [['nope'], /unknown verb "nope"/],
        [['add'], /add needs at least one word/],
        [['remove'], /remove needs at least one word/],
        [['list', '--section', 'flagWords'], /unknown section "flagWords"/],
        [['check', '--file', join(dir, 'missing.yaml')], /no such file/],
        [['check'], /none of words, ignorePaths is present/],
    ];
    for (const [args, message] of cases) {
        const result = await capture(args);
        t.equal(result.code, 1, `${args.join(' ')} exits 1`);
        t.match(result.err, message, `${args.join(' ')} is reported`);
        t.match(result.err, /Usage:/, `${args.join(' ')} prints usage`);
    }
    t.end();
});

test('--help prints the usage list', async t => {
    const result = await capture(['--help']);
    t.equal(result.code, undefined, 'help is not a failure');
    t.match(result.out, /blong-dev cspell add <word\.\.\.>/, 'lists the verbs');
    t.match(result.out, /Sections: words, ignorePaths/, 'names the sections');
    t.end();
});
