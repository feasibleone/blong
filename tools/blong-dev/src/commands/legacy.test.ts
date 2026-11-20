/**
 * Command-level tests for `blong-dev legacy` (commands/legacy.ts).
 *
 * The count is a work order, so the test is about what it *counts*: a call on a caller's log, once
 * per call; not a fastify `request.log`, not the shape quoted in a docblock, and never a second copy
 * from the generated tree. Each case runs the command as the CLI does, with the streams captured.
 */

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'tap';

import {legacy, legacyReport} from './legacy.ts';

interface ICaptured {
    out: string;
    err: string;
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
        await legacy(args);
        return {out: out.join(''), err: err.join(''), code: process.exitCode};
    } finally {
        process.stdout.write = originalOut;
        process.stderr.write = originalErr;
        process.exitCode = previousCode;
    }
}

/** A throwaway tree with one file per entry. */
function fixture(files: Record<string, string>): {root: string; dispose: () => void} {
    const root = mkdtempSync(join(tmpdir(), 'blong-dev-legacy-'));
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), text);
    }
    return {root, dispose: () => rmSync(root, {recursive: true, force: true})};
}

test('a level call is counted once per call, by package', async t => {
    const tree = fixture({
        // The shape a package writes: a component's own `log`, at one level.
        'realm/blong-chat/a.ts': [
            'this.log?.info?.({message: "one"});',
            'this.log?.warn?.(error);',
            'port.log?.debug?.("x");',
        ].join('\n'),
        'core/blong-mock/b.ts': 'this.log?.debug?.("x");\n',
        // A package with no level call contributes no line at all.
        'core/blong-gogo/c.ts': 'export const x = 1;\n',
    });
    t.teardown(tree.dispose);
    const report = await legacyReport(tree.root);
    t.equal(report.total, 4, 'four calls, one site each');
    t.same(
        report.packages.map(item => [item.package, item.count]),
        [
            ['realm/blong-chat', 3],
            ['core/blong-mock', 1],
        ],
        'grouped by package, largest first',
    );
    t.end();
});

test("what is not a caller's call is not counted", async t => {
    const tree = fixture({
        // fastify's own logger: the HTTP layer's, not the framework's ILog.
        'core/blong-gogo/static.ts': 'fastify.log.warn({root}, "no build");\n',
        // The shape quoted in a docblock is an example, not a call.
        'core/blong-gogo/doc.ts': [
            '/**',
            ' * A package that still writes `log?.warn?.(…)` is unswept.',
            ' */',
            'export const nothing = 0;',
        ].join('\n'),
        // Generated assembly of the packages: every call would be reported twice.
        'common/deploy/realm/blong-chat/a.ts': 'this.log?.info?.({});\n',
        // A test asserts on output; it is not a call site to sweep.
        'realm/blong-chat/a.test.ts': 'this.log?.info?.({});\n',
    });
    t.teardown(tree.dispose);
    const report = await legacyReport(tree.root);
    t.equal(report.total, 0, 'nothing counted');
    t.equal(report.packages.length, 0, 'and no package reported');
    t.end();
});

test('list names the packages and the total', async t => {
    const tree = fixture({'realm/blong-chat/a.ts': 'this.log?.warn?.(x);\n'.repeat(3)});
    t.teardown(tree.dispose);
    const {out} = await capture(['list', '--root', tree.root]);
    t.match(out, /realm\/blong-chat {2}3/, 'the package and its count line up');
    t.match(out, /3 total/, 'and the total is stated');
    t.end();
});

test('sites prints the file and the line behind each count', async t => {
    const tree = fixture({'realm/blong-chat/a.ts': 'const a = 1;\nthis.log?.warn?.(x);\n'});
    t.teardown(tree.dispose);
    const {out} = await capture(['sites', '--root', tree.root]);
    t.match(out, /realm\/blong-chat\/a\.ts:2 {2}this\.log\?\.warn\?\.\(x\);/, 'file and line');
    t.end();
});

test('check fails while anything remains and passes when nothing does', async t => {
    const dirty = fixture({'realm/blong-chat/a.ts': 'this.log?.warn?.(x);\n'});
    t.teardown(dirty.dispose);
    const failing = await capture(['check', '--root', dirty.root]);
    t.equal(failing.code, 1, 'a remaining call is a failed check');
    t.match(failing.err, /1 level call\(s\) in 1 package\(s\)/, 'and says how many');
    const clean = fixture({'realm/blong-chat/a.ts': 'signal?.agentTicketClaimed?.({});\n'});
    t.teardown(clean.dispose);
    const passing = await capture(['check', '--root', clean.root]);
    t.equal(passing.code, undefined, 'a swept tree passes without an exit code');
    t.end();
});

test('--json prints the inventory a script can read', async t => {
    const tree = fixture({'core/blong-mock/a.ts': 'this.log?.debug?.("x");\n'});
    t.teardown(tree.dispose);
    const {out} = await capture(['list', '--root', tree.root, '--json']);
    const report = JSON.parse(out) as {total: number; packages: Array<{package: string}>};
    t.equal(report.total, 1, 'the total');
    t.equal(report.packages[0]?.package, 'core/blong-mock', 'and the package');
    t.end();
});
