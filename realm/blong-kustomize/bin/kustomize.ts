#!/usr/bin/env -S node
/**
 * blong-kustomize — CLI for the deployment realm.
 *
 * Only what is specific to this realm lives here: the usage text, how the arguments name a method, and
 * what each method answers to. The plumbing — loading the realm on the `cli` intent, resolving the
 * method against the live registry, keeping stdout for the result, the exit codes — is
 * `@feasibleone/blong-gogo/cli.ts`, shared with every other realm CLI (the realm CLI pattern).
 *
 * It exists because two of the realm's handlers are decisions rather than steps, and a decision needs
 * something that can put it to a cluster without a UI:
 *
 *   - `release-notify` is what a release calls after publishing, so the CR it targets carries the new
 *     version and artifact (J). Nothing dispatches it until a release has an entry point that loads
 *     this realm and can reach a cluster — which is what this is.
 *   - `volume-prune` answers which retained versions are past the retention, and had no caller at all.
 *     It stays a report: the deletion is the operator's to perform, which the handler says in as many
 *     words, and a CLI that deleted on a read pass would be the mistake that comment was written to
 *     prevent.
 *
 * Usage:
 *   blong-kustomize release-notify --suite=shop --version=1.13.0 --artifact-url=https://…/suite.zip
 *   blong-kustomize release-notify --suite=shop --version=1.13.0 --framework-image=ghcr.io/…/blong-gogo
 *   blong-kustomize volume-prune [--retention=3]
 */
import {isCliEntry, runCli, type CliOptions} from '@feasibleone/blong-gogo/cli.ts';

import cliSuite from '../index.ts';
import {CHILD_ENTRY_ENV} from '../orchestrator/generate/kustomizeSuiteGenerate.ts';
import {USAGE, realmCommand} from './kustomizeCommand.ts';

/**
 * The framework CLI this command is itself built on.
 *
 * A command that generates a tree from a CR — `reconcile` — does that work in a child process which
 * the framework starts over the artifact, and the entry it re-runs is normally `process.argv[1]`:
 * the framework's own entry, with a different suite and the `k8s` intent. Here `argv[1]` is this
 * file, whose first positional is a realm command, so the child has to be told which entry to use —
 * and the right one is the framework version this command already resolved, because that is the
 * version whose adapter and planner this process is running.
 */
const frameworkEntry = (): string | undefined => {
    try {
        const plumbing = import.meta.resolve('@feasibleone/blong-gogo/cli.ts');
        return new URL('../bin/blong.ts', plumbing).pathname;
    } catch {
        return undefined;
    }
};

const childEntry = frameworkEntry();
if (childEntry) process.env[CHILD_ENTRY_ENV] = childEntry;

const cli: CliOptions = {
    // The realm's own entry: it loads the realm and, through the server platform, the cluster adapter
    // the two handlers call.
    suite: cliSuite as unknown as CliOptions['suite'],
    name: 'blong-kustomize',
    usage: USAGE,
    command: realmCommand,
};

/** Run the command; exported so a test can drive it without a subprocess. */
export const runKustomize = (): Promise<void> => runCli(cli);

// Guarded so the module can be imported by tests without executing the CLI.
if (isCliEntry(import.meta.url)) await runKustomize();
