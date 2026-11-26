import t from 'tap';

import {runCli, type CliOptions} from './cli.ts';

/**
 * A local verb answers without the realm — and that has to include the import.
 *
 * The distinction is easy to lose because `local` already skips `load`: a static
 * `import suite from '../index.ts'` in a `bin/` file evaluates the realm, and the realm's entry
 * imports the framework, whose package map resolves to a **built** file (`./dist/types.js`) unless
 * something has built the tree. A tenant who installed the CLI with `npx`, or a CI job whose build
 * step comes later in the run, then fails before the verb runs at all — a `ERR_MODULE_NOT_FOUND`
 * naming a `dist/` path, which says nothing about the command asked for (`@@F-860`).
 *
 * `resolveSuite` is the way out: it is the only reference to the realm, and nothing before it —
 * help, a usage error, a local verb — calls it. Pinned here so a future `bin/` file that imports
 * its realm eagerly fails a test rather than a deployment.
 */
const withArgv = async (argv: string[], options: CliOptions): Promise<number | undefined> => {
    const saved = process.argv;
    const savedExit = process.exitCode;
    const savedWrite = process.stdout.write;
    try {
        process.argv = ['node', 'bin/cli.ts', ...argv];
        process.exitCode = undefined;
        // The loader's messages and the result go through stdout; a test that let them out would
        // print JSON into tap's own stream.
        process.stdout.write = ((_chunk: string | Uint8Array) =>
            process.stderr.write('')) as typeof process.stdout.write;
        await runCli(options);
        return process.exitCode;
    } finally {
        process.argv = saved;
        process.exitCode = savedExit;
        process.stdout.write = savedWrite;
    }
};

/**
 * A suite that must never be resolved: the counter is what the assertions read, and throwing means a
 * test that reached it fails loudly rather than passing on a realm it should not have touched.
 */
const countedSuite = (): {
    options: {resolveSuite: NonNullable<CliOptions['resolveSuite']>};
    loaded: () => number;
} => {
    let loaded = 0;
    return {
        loaded: () => loaded,
        options: {
            resolveSuite: async () => {
                loaded += 1;
                throw new Error('the realm was imported for a local verb');
            },
        },
    };
};

t.test('a local verb runs without importing the realm', async t => {
    const {options, loaded} = countedSuite();
    const code = await withArgv(['init'], {
        ...options,
        name: 'probe',
        usage: 'usage\n',
        command: () => ({method: 'probe.init', local: async () => 0}),
    });
    t.equal(code, 0, 'the verb answered');
    t.equal(loaded(), 0, 'and the realm was never imported');
});

t.test('a local verb that throws reports its own message', async t => {
    const {options, loaded} = countedSuite();
    const code = await withArgv(['init'], {
        ...options,
        name: 'probe',
        usage: 'usage\n',
        command: () => ({
            method: 'probe.init',
            local: async () => {
                throw new Error('no folder');
            },
        }),
    });
    t.equal(code, 1, 'a thrown error is a non-zero exit');
    t.equal(loaded(), 0, 'still without the realm');
});

t.test('help and a usage error answer before the realm too', async t => {
    const help = countedSuite();
    t.equal(
        await withArgv(['--help'], {
            ...help.options,
            name: 'probe',
            usage: 'usage\n',
            command: () => undefined,
        }),
        undefined,
        'help leaves the exit code alone',
    );
    t.equal(help.loaded(), 0, 'no realm for help');

    const usage = countedSuite();
    t.equal(
        await withArgv(['nonsense'], {
            ...usage.options,
            name: 'probe',
            usage: 'usage\n',
            command: () => undefined,
        }),
        1,
        'an unrecognised command is a usage error',
    );
    t.equal(usage.loaded(), 0, 'and no realm for it either');
});

t.test('a command that needs the realm resolves it once', async t => {
    let loaded = 0;
    const code = await withArgv(['release-notify'], {
        resolveSuite: async () => {
            loaded += 1;
            throw new Error('a realm is all this test needs it to reach');
        },
        name: 'probe',
        usage: 'usage\n',
        command: () => ({method: 'probe.release.notify'}),
    });
    t.equal(code, 1, 'the failure is reported rather than swallowed');
    t.equal(loaded, 1, 'and the realm was asked for exactly once');
});
