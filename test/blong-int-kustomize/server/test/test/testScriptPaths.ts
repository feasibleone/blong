import {handler, type IAssert} from '@feasibleone/blong';
import {delimiter, dirname} from 'node:path';

import {createIo, onPath, runPath} from '../../../lib/exec.ts';

/**
 * server/test/test/testScriptPaths.ts — the tools a step shells out to, without a global install.
 *
 * The runbook provisions its own login with `blong-dev user add`, and that call is only reachable two
 * ways: through `npm run`, which prepends the package's `node_modules/.bin`, or through the developer's
 * own `PATH`, where a global link usually sits. CI starts the cycle as `node bin/blongIntKustomize.ts`,
 * so neither holds, and the run stopped with `blong-dev is not on PATH` while the dependency was
 * declared and installed @@F-809.
 *
 * What is asserted is therefore the seam rather than the tool: the `PATH` a child is given starts with
 * the package's own bins, a workspace tool resolves in that `PATH` and not in the runner's, and a child
 * spawned through it sees the same one. The last of the three is the one that matters — a run that
 * decided by the runner's environment and then spawned with this one would still have refused.
 *
 * Registered as the `test.script.paths` group (`integration.watch.test` in `index.ts`).
 */
export default handler(({lib: {group}}) => ({
    testScriptPaths: ({name = 'script paths'}: {name?: string} = {}) =>
        group(name)([
            async function aWorkspaceToolIsReachableWithoutAPathEntry(assert: IAssert) {
                const bare = '/usr/bin:/bin';
                assert.equal(
                    onPath('blong-dev', bare),
                    false,
                    'a runner whose PATH holds nothing of ours cannot see the tool',
                );
                assert.equal(
                    onPath('blong-dev', runPath(bare)),
                    true,
                    'and the PATH a child is given finds it in the package that depends on it',
                );
                assert.ok(
                    runPath(bare).endsWith(bare),
                    'the caller’s PATH is kept, behind what the run adds to it',
                );
                assert.match(
                    runPath(bare).split(delimiter)[0] ?? '',
                    /node|bin$/,
                    'the first directory is one that can start a bin, not the repository root',
                );
                assert.ok(
                    runPath(bare).split(delimiter).includes(dirname(process.execPath)),
                    'the Node running this run is on it too, because a bin shim execs one',
                );
            },

            async function aChildIsSpawnedWithThatPath(assert: IAssert) {
                const io = createIo({quiet: true});
                const printed = await io.capture(
                    process.execPath,
                    ['-e', 'process.stdout.write(process.env.PATH ?? "")'],
                    {env: {PATH: '/usr/bin:/bin'}},
                );
                assert.equal(
                    onPath('blong-dev', printed.trim()),
                    true,
                    'the process a step starts inherits the bins, whatever PATH the runner had',
                );
                assert.ok(
                    printed.startsWith(runPath('')),
                    'and its PATH is built the way every other child’s is',
                );
            },

            async function theToolItselfStartsFromThatPath(assert: IAssert) {
                // The end of the story the gate tells: `blong-dev` is a shell shim that execs `node`, so
                // this passes only if both the shim and the interpreter behind it were found — which is
                // what a provisioning step needs before it can ask the database anything (F-809).
                const io = createIo({quiet: true});
                const answer = await io.capture('blong-dev', ['--help'], {
                    env: {PATH: '/usr/bin:/bin'},
                });
                assert.match(
                    answer,
                    /blong-dev/,
                    'the workspace tool starts with no global install',
                );
            },
        ]),
}));
