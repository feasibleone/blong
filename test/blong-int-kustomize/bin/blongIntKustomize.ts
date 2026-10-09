#!/usr/bin/env -S node
/**
 * blong-int-kustomize — the CLI for the kustomize deployment's end-to-end runbook.
 *
 * Only what is specific to this package lives here: the usage text, how the arguments name a method,
 * and what each method answers to. The plumbing — loading the suite on the `cli` intent, resolving the
 * method against the live registry, keeping stdout for the result, the exit codes — is
 * `@feasibleone/blong-gogo/cli.ts`, shared with every other command in the repo (the realm CLI
 * pattern). The commands themselves are handlers in `runbook/`, so a caller can reach the same step
 * through the framework rather than through a shell.
 *
 * Usage:
 *   blong-int-kustomize machine prepare --cluster=dev-cluster
 *   blong-int-kustomize suite deploy --cluster=dev-cluster --namespace=blong-suite
 *   blong-int-kustomize cycle run --cluster=dev-cluster
 */
import {isCliEntry, runCli, type CliOptions} from '@feasibleone/blong-gogo/cli.ts';

import cliSuite from '../index.ts';
import {USAGE, realmCommand} from './blongIntKustomizeCommand.ts';

const cli: CliOptions = {
    // The package's own suite: it loads the `runbook` realm, whose handlers are the commands.
    suite: cliSuite as unknown as CliOptions['suite'],
    name: 'blong-int-kustomize',
    usage: USAGE,
    command: realmCommand,
    hint: 'Run `blong-int-kustomize help` for the command list.',
};

/** Run the command; exported so a test can drive it without a subprocess. */
export const runIntKustomize = (): Promise<void> => runCli(cli);

// Guarded so the module can be imported by a test without executing the CLI.
if (isCliEntry(import.meta.url)) await runIntKustomize();
