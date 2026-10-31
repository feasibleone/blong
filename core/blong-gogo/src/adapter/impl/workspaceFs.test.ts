import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {test} from 'tap';

import type {IWorkspaceConfig} from './workspaceFs.ts';
import {
    workspaceList,
    workspacePrepare,
    workspaceRead,
    workspaceRemove,
    workspaceRollback,
    workspaceRun,
    workspaceWrite,
} from './workspaceFs.ts';

/**
 * The workspace operations in a temporary directory: no platform, no database, no ticket.
 *
 * What is asserted is what the realm relies on — a template copied once, files written where the jail
 * allows, a command refused when the deployment said so, and a timeout that leaves nothing running
 * (`@@D-710`).
 */
const setup = async (shell: IWorkspaceConfig['shell'] = {}): Promise<IWorkspaceConfig> => {
    const root = await mkdtemp(join(tmpdir(), 'blong-agent-ws-'));
    return {root, ...(shell && {shell})};
};

/** The code a call refused with, which is what the realm maps to a typed error. */
const codeOf = async (what: () => Promise<unknown>): Promise<string | undefined> => {
    try {
        await what();
        return undefined;
    } catch (error) {
        return (error as {code?: string}).code;
    }
};

test('workspace.prepare copies the template once', async t => {
    const root = await mkdtemp(join(tmpdir(), 'blong-agent-ws-'));
    const template = join(root, 'template');
    await mkdir(template, {recursive: true});
    await writeFile(join(template, 'README.md'), '# start here', 'utf8');
    const config: IWorkspaceConfig = {root: join(root, 'tickets'), template};

    const first = await workspacePrepare(config, {ticketId: 'T-1'});
    t.equal(
        await readFile(join(first.workspacePath, 'README.md'), 'utf8'),
        '# start here',
        'a fresh workspace starts from the template',
    );

    await workspaceWrite(config, {ticketId: 'T-1', path: 'own.txt', content: 'mine'});
    await workspacePrepare(config, {ticketId: 'T-1'});
    t.equal(
        await readFile(join(first.workspacePath, 'own.txt'), 'utf8'),
        'mine',
        'and preparing again leaves what is already there alone',
    );
    t.end();
});

test('workspace.file round-trips through the jail', async t => {
    const config = await setup();
    const written = await workspaceWrite(config, {
        ticketId: 'T-1',
        path: 'src/deep/file.ts',
        content: 'export const a = 1;',
    });
    t.equal(written.bytes, 19, 'the write reports its size');
    t.equal(
        (await workspaceRead(config, {ticketId: 'T-1', path: 'src/deep/file.ts'})).content,
        'export const a = 1;',
        'and what was written is what is read',
    );
    const {entries} = await workspaceList(config, {ticketId: 'T-1'});
    t.same(
        entries,
        [{name: 'src', kind: 'directory'}],
        'the listing names the directory it created',
    );
    const src = await workspaceList(config, {ticketId: 'T-1', path: 'src'});
    t.same(src.entries, [{name: 'deep', kind: 'directory'}], 'and it can be listed in turn');
    t.end();
});

test('workspace.command is refused when the deployment disabled it', async t => {
    const config = await setup({enabled: false});
    await workspacePrepare(config, {ticketId: 'T-1'});
    t.equal(
        await codeOf(() =>
            workspaceRun(config, {ticketId: 'T-1', command: process.execPath, args: ['-e', '0']}),
        ),
        'agent.commandDisabled',
        'the capability is off unless it was switched on',
    );
    t.end();
});

test('workspace.command runs with argv, in the ticket, and reports its output', async t => {
    const config = await setup({enabled: true, timeoutMs: 10_000});
    await workspacePrepare(config, {ticketId: 'T-1'});
    const result = await workspaceRun(config, {
        ticketId: 'T-1',
        command: process.execPath,
        args: ['-e', 'console.log(process.cwd()); console.error("err")'],
    });
    t.equal(result.exitCode, 0, 'the command exits as it did');
    t.match(result.stdout, /T-1/, 'it ran in the ticket directory');
    t.equal(result.stderr, 'err\n', 'and its stderr is kept apart');
    t.notOk(result.truncated, 'nothing was dropped');
    t.end();
});

test('workspace.command outliving its timeout is killed', async t => {
    const config = await setup({enabled: true});
    await workspacePrepare(config, {ticketId: 'T-1'});
    const started = Date.now();
    const code = await codeOf(() =>
        workspaceRun(config, {
            ticketId: 'T-1',
            command: process.execPath,
            args: ['-e', 'setTimeout(() => {}, 60_000)'],
            timeoutMs: 150,
        }),
    );
    t.equal(code, 'agent.commandTimeout', 'a command that runs too long is a typed failure');
    t.ok(Date.now() - started < 5_000, 'and the call returns rather than waiting for it');
    t.end();
});

test('workspace.rollback says so when the ticket is not a repository', async t => {
    const config = await setup();
    await workspacePrepare(config, {ticketId: 'T-1'});
    const result = await workspaceRollback(config, {ticketId: 'T-1'});
    t.equal(result.restored, false, 'a template directory has nothing to roll back to');
    t.end();
});

test('workspace.remove purges the directory', async t => {
    const config = await setup();
    const prepared = await workspacePrepare(config, {ticketId: 'T-1'});
    await workspaceWrite(config, {ticketId: 'T-1', path: 'x.txt', content: 'x'});
    const removed = await workspaceRemove(config, {ticketId: 'T-1'});
    t.equal(removed.removed, true, 'the purge reports what it did');
    t.equal(removed.workspacePath, prepared.workspacePath, 'and names the directory it removed');
    t.rejects(
        workspaceRead(config, {ticketId: 'T-1', path: 'x.txt'}),
        'the files are gone with it',
    );
    t.end();
});
