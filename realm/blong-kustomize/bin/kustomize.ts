#!/usr/bin/env -S node
/**
 * blong-kustomize — CLI for the deployment realm; the plumbing is `@feasibleone/blong-gogo/cli.ts`.
 *
 * Usage:
 *   blong-kustomize release-notify --suite=shop --version=1.13.0 --artifact-url=https://…/suite.zip \
 *       --artifact-digest=<sha256> --framework-version=1.42.0
 *   blong-kustomize release-notify --suite=shop --version=1.13.0 --framework-image=ghcr.io/…/blong-gogo
 *   blong-kustomize volume-prune [--retention=3]
 */
import {isCliEntry, runCli, type CliOptions} from '@feasibleone/blong-gogo/cli.ts';

import {exitCodeFor} from './exitCode.ts';
import {helpFor, realmCommand} from './kustomizeCommand.ts';

/**
 * The realm's entry, imported by the first command that needs it — never by `init`,
 * `provision` or `secret`.
 *
 * A static import here is what broke those verbs in a checkout that had not been built: the entry
 * imports the framework, whose package map points at `./dist/types.js`, and `dist` is a build
 * output that CI makes later in the run. A tenant running the CLI from `npx` has no build either,
 * so a verb that exists to answer without the realm has to answer without importing it (@@D-1022).
 *
 * The child entry is set here because only `reconcile` spawns one: the framework starts a child
 * over the artifact, and the entry it re-runs is normally `process.argv[1]` — which here is this
 * file, whose first positional is a realm command. The right entry is the framework version this
 * command already resolved, since that is the version whose adapter and planner this process runs.
 */
const resolveSuite: NonNullable<CliOptions['resolveSuite']> = async () => {
    const {CHILD_ENTRY_ENV} = await import('../orchestrator/generate/kustomizeSuiteGenerate.ts');
    try {
        const plumbing = import.meta.resolve('@feasibleone/blong-gogo/cli.ts');
        process.env[CHILD_ENTRY_ENV] = new URL('../bin/blong.ts', plumbing).pathname;
    } catch {
        // No framework to point at: the child falls back to `argv[1]`, which is what a realm
        // without this option would have done anyway.
    }
    const realm = await import('../index.ts');
    return realm.default as unknown as Awaited<ReturnType<NonNullable<CliOptions['resolveSuite']>>>;
};

const cli: CliOptions = {
    // The realm's own entry loads it, and through the server platform the cluster adapter the two
    // handlers call — which is why importing it is left to the command that runs them.
    resolveSuite,
    name: 'blong-kustomize',
    // The fallback for a usage error; every `--help` is answered by the registry, one level at a time.
    usage: helpFor([]),
    help: helpFor,
    // `--set a.b=c` repeats, so minimist has to keep it a string list rather than take the last one:
    // a tenant that sets a user and a password in one call expects both.
    stringFlags: ['set'],
    command: realmCommand,
    // A command that discovered a failure answers with it rather than throwing, so the verdict is
    // read here: without this, a release that patched nothing exits 0 and a pipeline believes it.
    exitCodeFor,
};

/** Run the command; exported so a test can drive it without a subprocess. */
export const runKustomize = (): Promise<void> => runCli(cli);

// Guarded so the module can be imported by tests without executing the CLI.
if (isCliEntry(import.meta.url)) await runKustomize();
