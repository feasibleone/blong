#!/usr/bin/env -S node
/**
 * kukum — CLI for the blong-kukum primitive API.
 *
 * Only what is specific to kukum lives here: the usage text, how the arguments
 * name a method, and how a result reads. The plumbing — loading the realm on the
 * `cli` intent, resolving the method against the live registry, keeping stdout
 * for the result, the exit codes — is `@feasibleone/blong-gogo/cli.ts`, shared
 * with every other realm CLI.
 *
 * Usage:
 *   kukum primitive find
 *   kukum handler add --subject=demo --object=item --predicate=add --kind=api
 *   kukum handler add --subject=demo --object=item --predicate=add --dry-run
 *   kukum model find --subject=access             # any primitive: find|get|add|edit|check
 *   kukum source get gateway/kukum/validation.ts
 *   kukum source check --files=a.ts,b.ts
 *   kukum tree find --target=../blong-access
 *   kukum activation find
 *   kukum instruction find --target=.
 */
import {
    isCliEntry,
    runCli,
    type Argv,
    type CliOptions,
    type ParsedArgs,
} from '@feasibleone/blong-gogo/cli.ts';

import cliSuite from '../cli.ts';
import type {OperationParams} from '../operation.ts';

const USAGE = `kukum — scaffold and inspect Blong primitives

Usage
  kukum primitive find                         list primitives and their kinds
  kukum activation find                        layer -> intent activation table
  kukum instruction find [--target=DIR]        artifacts carrying agent instructions
  kukum tree find [--target=DIR]               layer/group/file layout on disk
  kukum source get PATH [--target=DIR]         print an artifact and its instructions
  kukum source check [--files=a,b] [--target]  lint a package or specific files
  kukum <primitive> find|get|add|edit|check [options]
      --target=DIR        realm/suite root (default: current directory)
      --subject=NAME      realm name (triple subject)
      --object=NAME       entity name (triple object)
      --predicate=NAME    action for a handler triple (add, find, …)
      --kind=KIND         primitive kind (see \`primitive find\`)
      --layer=NAME        layer folder
      --group=NAME        handler group folder
      --platform=NAME     server | browser
      --path=FILE         artifact path (get/edit/find)
      --instructions=TEXT agent instructions, repeatable
      --dry-run           plan without writing (add/edit)
      --replace           regenerate shared files instead of composing (add/edit)
      --force             overwrite hand-written files
      --output=json|text  output format (default: json when not a TTY)

Examples
  kukum handler add --subject=demo --object=item --predicate=add --kind=api --dry-run
  kukum seed add --subject=demo --object=item --kind=test
  kukum source check --files=orchestrator/kukum/handlers.ts
`;

/** Default rendering for a primitive operation result. */
function textOf(result: unknown): string {
    const value = result as {
        kind?: string;
        files?: Array<{path: string; action: string; handWritten: boolean}>;
        written?: string[];
        skipped?: string[];
        messages?: string[];
        warnings?: string[];
        diagnostics?: {errors: number; warnings: number; skipped?: string};
    };
    const lines: string[] = [];
    for (const message of value.messages ?? []) lines.push(message);
    for (const file of value.files ?? []) {
        const flags = [file.action, file.handWritten ? 'hand-written' : '']
            .filter(Boolean)
            .join(' ');
        lines.push(`${file.path}  (${flags})`);
    }
    if (value.written?.length) lines.push(`written: ${value.written.join(', ')}`);
    if (value.skipped?.length) lines.push(`skipped: ${value.skipped.join(', ')}`);
    for (const warning of value.warnings ?? []) lines.push(`warning: ${warning}`);
    if (value.diagnostics) {
        lines.push(
            value.diagnostics.skipped
                ? `diagnostics: skipped (${value.diagnostics.skipped})`
                : `diagnostics: ${value.diagnostics.errors} error(s), ${value.diagnostics.warnings} warning(s)`,
        );
    }
    return lines.join('\n');
}

/**
 * Human rendering per method.
 *
 * Kept per method rather than driven off the result shape, because the shapes
 * are not uniform: `source.check` returns `files` as bare strings where the
 * primitive operations return objects, so one generic formatter would print
 * `undefined` for it.
 */
function textFor(method: string, result: unknown): string {
    if (method === 'kukum.primitive.find') {
        const primitives = result as Array<{
            id: string;
            kinds: string[];
            title: string;
            skill: string;
        }>;
        return primitives
            .map(p => `${p.id} [${p.kinds.join(', ')}] — ${p.title} (skill: ${p.skill})`)
            .join('\n');
    }
    if (method === 'kukum.activation.find') return JSON.stringify(result, null, 2);
    if (method === 'kukum.instruction.find') {
        const found = (result as {files: Array<{path: string; instructions: string[]}>}).files;
        return found.length
            ? found.map(f => `${f.path}\n  - ${f.instructions.join('\n  - ')}`).join('\n')
            : 'no artifacts carry instructions';
    }
    if (method === 'kukum.tree.find') {
        // Registry-backed now that the CLI runs inside blong: the old offline
        // view classified files by folder on disk instead.
        const view = result as {
            realms?: Array<{realm: string; groups: string[]; files: string[]}>;
        };
        return (view.realms ?? []).map(r => `${r.realm}:\n  ${r.files.join('\n  ')}`).join('\n');
    }
    if (method === 'kukum.source.get') return (result as {source: string}).source;
    if (method === 'kukum.source.check') {
        const report = (result as {diagnostics?: {errors: number; warnings: number}}).diagnostics;
        return report
            ? `${report.errors} error(s), ${report.warnings} warning(s)`
            : 'no diagnostics';
    }
    return textOf(result);
}

/** The operation params the flags describe. */
function paramFlags(argv: Argv): OperationParams {
    const params: OperationParams = {
        target: argv.target ? String(argv.target) : undefined,
        subject: argv.subject ? String(argv.subject) : undefined,
        object: argv.object ? String(argv.object) : undefined,
        kind: argv.kind ? String(argv.kind) : undefined,
        layer: argv.layer ? String(argv.layer) : undefined,
        group: argv.group ? String(argv.group) : undefined,
        platform: (argv.platform as 'server' | 'browser' | undefined) ?? undefined,
        path: argv.path ? String(argv.path) : undefined,
        dryRun: Boolean(argv['dry-run']),
        force: Boolean(argv.force),
        // `add` composes with anything it generated; --replace regenerates from
        // scratch, which is only ever what you want for a deliberate reset.
        mode: argv.replace ? 'replace' : undefined,
        instructions:
            argv.instructions === undefined
                ? undefined
                : ([] as string[]).concat(argv.instructions as string | string[]),
        params: {},
    };
    if (argv.predicate) params.params = {predicate: String(argv.predicate)};
    if (argv.files)
        params.files = ([] as string[])
            .concat(argv.files as string | string[])
            .flatMap(f => String(f).split(','));
    return params;
}

/**
 * `kukum <primitive> <predicate> [path]` → `kukum.<primitive>.<predicate>`.
 *
 * The predicate defaults to `find`, and a third positional is the artifact path
 * (`kukum source get PATH`) rather than a flag.
 */
function command({argv, positionals}: ParsedArgs) {
    const [first, second] = positionals;
    if (!first) return undefined;
    const params = paramFlags(argv);
    if (positionals[2] !== undefined && params.path === undefined) {
        params.path = positionals[2];
    }
    return {method: `kukum.${first}.${second ?? 'find'}`, params};
}

export const kukumCli: CliOptions = {
    suite: cliSuite,
    name: 'kukum',
    usage: USAGE,
    stringFlags: ['target', 'output'],
    command,
    format: textFor,
    // A `check` that found errors did not do what was asked.
    exitCodeFor: (_method, result) =>
        (result as {diagnostics?: {errors?: number}} | undefined)?.diagnostics?.errors
            ? 1
            : undefined,
    hint: 'Run `kukum primitive find` for the catalogue.',
};

/** Run the command; exported so a test can drive it without a subprocess. */
export const runKukum = (): Promise<void> => runCli(kukumCli);

// Guarded so the module can be imported by tests without executing the CLI.
if (isCliEntry(import.meta.url)) await runKukum();
