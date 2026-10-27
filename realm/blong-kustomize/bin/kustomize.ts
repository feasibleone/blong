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
