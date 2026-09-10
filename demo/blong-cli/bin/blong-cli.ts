#!/usr/bin/env -S node
/**
 * blong-cli — the demo's command.
 *
 * This file is the whole CLI. Loading the suite on the `cli` intent, resolving
 * the method against the live registry, keeping stdout for the result and the
 * exit-code conventions all live in `@feasibleone/blong-gogo/cli.ts` — the
 * plumbing extracted from `core/blong-kukum/bin/kukum.ts`. What is left is only
 * what is specific to this command: the usage text, how arguments name a method,
 * and how a result reads.
 *
 * Usage:
 *   blong-cli slug get --value="Hello, World!"
 *   blong-cli statistics get --file=README.md
 *   blong-cli <object> <predicate> [--value=TEXT | --file=PATH]
 */
import {isCliEntry, runCli, type CliOptions, type ParsedArgs} from '@feasibleone/blong-gogo/cli.ts';

import cliSuite from '../cli.ts';
import type {TextStatistics} from '../text/orchestrator/text/textStatisticsGet.ts';

const USAGE = `blong-cli — a demo realm driven by the \`cli\` intent

Usage
  blong-cli <object> <predicate> [options]
      --value=TEXT     operate on the given text
      --file=PATH      operate on the contents of a file
      --output=json|text

Commands
  blong-cli slug get --value="Hello, World!"     -> hello-world
  blong-cli slug get --file=README.md
  blong-cli statistics get --value="one two"     -> lines/words/characters

The process binds no port and watches nothing: every dispatch resolves in-process
and the command exits when it is done.
`;

/** The realm the demo hosts — the namespace its orchestrator registers. */
const REALM = 'text';

/** `blong-cli <object> <predicate>` → `text.<object>.<predicate>`. */
function command({positionals, argv}: ParsedArgs) {
    const [object, predicate] = positionals;
    if (!object) return undefined;
    const params: Record<string, unknown> = {};
    if (argv.value !== undefined) params.value = String(argv.value);
    if (argv.file !== undefined) params.file = String(argv.file);
    return {method: `${REALM}.${object}.${predicate ?? 'get'}`, params};
}

export const blongCliOptions: CliOptions = {
    suite: cliSuite,
    name: 'blong-cli',
    usage: USAGE,
    stringFlags: ['value', 'file', 'output'],
    command,
    // Only the statistics result needs a shape of its own; everything else here
    // is a string.
    format: (method, result) =>
        method === 'text.statistics.get'
            ? Object.entries(result as TextStatistics)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join('\n')
            : String(result),
    hint: 'Run `blong-cli help` for the command list.',
};

// Guarded so the module can be imported by a test without executing the command.
if (isCliEntry(import.meta.url)) await runCli(blongCliOptions);
