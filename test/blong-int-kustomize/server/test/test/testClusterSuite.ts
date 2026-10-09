import {handler, type IAssert} from '@feasibleone/blong';

import {
    backingServicesCheck,
    externalNameAliasReport,
    migrationStepRan,
    noSemlogReference,
    podsOnNodesReport,
    suiteVersionDirectoryReport,
} from '../../../lib/checks.ts';
import {createIo} from '../../../lib/exec.ts';

/**
 * server/test/test/testClusterSuite.ts — what a deployed suite has to answer for.
 *
 * The runbook asserts the same things while it deploys, and this is the other half of that: given a
 * suite somebody else put on a cluster, is it right? Nothing here generates a tree, applies one or
 * waits for a rollout, so it runs against any deployment — which is what makes it usable after a
 * release, and what gives the assertions a place in the test story rather than only in a CI step's
 * shell.
 *
 * Gated, because it reads a real cluster: a run without `BLONG_TEST_CLUSTER=1` skips every step, the
 * way `testClusterApply` in the deployment realm gates its writes on `BLONG_TEST_APPLY=1`.
 *
 * Registered as the `test.cluster.suite` group (`integration.watch.test` in `server.ts`).
 */
const gate = (): unknown =>
    process.env['BLONG_TEST_CLUSTER'] === '1'
        ? undefined
        : {skipped: 'set BLONG_TEST_CLUSTER=1 to read a cluster'};

/** The namespace the suite was deployed into, and the tree it was generated from. */
const target = (): {namespace: string; tree: string} => ({
    namespace: process.env['SUITE_NAMESPACE'] ?? 'blong-suite',
    tree: process.env['SUITE_TREE'] ?? 'system/kustomize',
});

/**
 * An `io` that keeps what a step said instead of printing it.
 *
 * tap reads stdout, so a step that logged its progress would be read as a test line and break the
 * report: the lines are collected and asserted on instead, which is also what turns "it ran" into a
 * claim a reader can see the evidence for.
 */
const quiet = () => createIo({quiet: true});

export default handler(({lib: {group}}) => ({
    testClusterSuite: ({name = 'cluster suite'}: {name?: string} = {}) =>
        group(name)([
            async function theReleaseStepRan(assert: IAssert) {
                const skipped = gate();
                if (skipped) return skipped;
                const io = quiet();
                await migrationStepRan({namespace: target().namespace}, io);
                assert.match(
                    io.lines.join('\n'),
                    /completed/,
                    'the migration Job the tree carries is the step that created the schema',
                );
            },

            async function noProcessRenderedASemlogReference(assert: IAssert) {
                const skipped = gate();
                if (skipped) return skipped;
                const io = quiet();
                await noSemlogReference({namespace: target().namespace}, io);
                assert.match(
                    io.lines.join('\n'),
                    /no container printed a semlog reference/,
                    'a released process renders no reference to a store nobody reads',
                );
            },

            async function theClusterIsReachableAtAll(assert: IAssert) {
                const skipped = gate();
                if (skipped) return skipped;
                const io = quiet();
                await podsOnNodesReport({namespace: target().namespace}, io);
                assert.match(
                    io.lines.join('\n'),
                    /Running|Succeeded/,
                    'the suite is on a cluster this run can read',
                );
                const alias = quiet();
                await externalNameAliasReport({namespace: target().namespace}, alias);
                assert.ok(alias.lines.length, 'and one alias is readable by name');
            },

            async function theServicesTheDeploymentBroughtAreReachable(assert: IAssert) {
                const skipped = gate();
                if (skipped) return skipped;
                const {namespace, tree} = target();
                const io = quiet();
                await backingServicesCheck(
                    {namespace, tree, serviceOff: process.env['SERVICE_OFF'] || undefined},
                    io,
                );
                const said = io.lines.join('\n');
                assert.ok(
                    said.includes('no service is left to bring') ||
                        said.includes('is readable in') ||
                        said.includes('carries nothing of'),
                    'every service the deployment brought is waited for, resolved and readable',
                );
            },

            async function theVersionDirectoryIsOnEveryNode(assert: IAssert) {
                const skipped = gate();
                if (skipped) return skipped;
                const io = quiet();
                await suiteVersionDirectoryReport({namespace: target().namespace}, io);
                assert.match(
                    io.lines.join('\n'),
                    /suites\//,
                    'each node is where the suite volume was unpacked',
                );
            },
        ]),
}));
