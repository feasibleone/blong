/**
 * Render the three `blong-dev` help levels from {@link COMMANDS}.
 *
 * Level 1 is the command list, level 2 is one command with its verbs, and level 3 is
 * one verb with its parameters and examples. The same functions produce the hint a
 * usage error ends with, so a caller that omitted an argument is pointed at the help
 * rather than at a wall of text.
 */

import {COMMANDS} from './commands.ts';
import type {IHelpCommand, IHelpOption, IHelpVerb} from './types.ts';

/** The width prose is wrapped to, so the text reads without a terminal scrolling sideways. */
const WIDTH = 80;

/** Wrap one paragraph to {@link WIDTH}, at word boundaries. */
function wrap(text: string, indent = ''): string[] {
    const words = text.split(/\s+/).filter(word => word !== '');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        if (line === '') {
            line = word;
        } else if (`${indent}${line} ${word}`.length <= WIDTH) {
            line = `${line} ${word}`;
        } else {
            lines.push(`${indent}${line}`);
            line = word;
        }
    }
    if (line !== '') lines.push(`${indent}${line}`);
    return lines;
}

/** A titled two-column block, skipped when it has no rows. */
function table(title: string, rows: readonly (readonly [string, string])[]): string[] {
    if (rows.length === 0) return [];
    const width = Math.max(...rows.map(([name]) => name.length));
    return ['', `${title}:`, ...rows.map(([name, text]) => `  ${name.padEnd(width)}  ${text}`)];
}

/** The command named as typed, or `undefined`. */
export function findCommand(name: string | undefined): IHelpCommand | undefined {
    return name === undefined ? undefined : COMMANDS.find(command => command.name === name);
}

/** The verb of a command, or `undefined`. */
export function findVerb(
    command: IHelpCommand | undefined,
    name: string | undefined,
): IHelpVerb | undefined {
    return name === undefined ? undefined : command?.verbs?.find(verb => verb.name === name);
}

/** Every command name, in the order the command list shows them. */
export function commandNames(): string[] {
    return COMMANDS.map(command => command.name);
}

/** Level 1: the command list. */
export function renderIndex(): string {
    const width = Math.max(...COMMANDS.map(command => command.name.length));
    return [
        'blong-dev — the blong monorepo development CLI',
        '',
        'Usage:',
        '  blong-dev <command> [args...]',
        '  blong-dev <command> <verb> [args...]',
        '  blong-dev help [<command> [<verb>]]',
        '',
        'Commands:',
        ...COMMANDS.map(command => `  blong-dev ${command.name.padEnd(width)}  ${command.summary}`),
        '',
        'Run `blong-dev <command> --help` for a command and its verbs, and',
        '`blong-dev <command> <verb> --help` for one verb, its parameters and examples.',
        '',
    ].join('\n');
}

/** Level 2: one command, its verbs and its own options. */
export function renderCommand(command: IHelpCommand): string {
    const lines = [
        `blong-dev ${command.name} — ${command.summary}`,
        '',
        ...wrap(command.description),
    ];

    const usage =
        command.usage ?? (command.verbs ? `blong-dev ${command.name} <verb> [args...]` : undefined);
    if (usage !== undefined)
        lines.push('', 'Usage:', ...usage.split('\n').map(line => `  ${line}`));

    lines.push(
        ...table(
            'Verbs',
            (command.verbs ?? []).map(verb => [verb.name, verb.summary]),
        ),
    );
    lines.push(...table('Options', optionsOf(command.options)));
    lines.push(...examplesOf(command.examples));
    if (command.note !== undefined) lines.push('', command.note);
    if (command.verbs !== undefined) {
        lines.push('', `Run \`blong-dev ${command.name} <verb> --help\` for one verb.`);
    }
    lines.push('');
    return lines.join('\n');
}

/** Level 3: one verb, its parameters and examples. */
export function renderVerb(command: IHelpCommand, verb: IHelpVerb): string {
    const lines = [`blong-dev ${command.name} ${verb.name} — ${verb.summary}`];
    // The title already says what the verb is for, so a one-line verb does not need it twice.
    if (verb.description !== undefined) lines.push('', ...wrap(verb.description));
    lines.push('', 'Usage:', ...verb.usage.split('\n').map(line => `  ${line}`));
    lines.push(...table('Options', optionsOf(verb.options)));
    lines.push(...examplesOf(verb.examples));
    lines.push('');
    return lines.join('\n');
}

/** The help text for a level, with an unknown name falling back to the level above. */
export function helpText(command?: string, verb?: string): string {
    if (command === undefined) return renderIndex();
    const found = findCommand(command);
    if (found === undefined) {
        return `blong-dev: no command "${command}"\n\n${renderIndex()}`;
    }
    if (verb === undefined) return renderCommand(found);
    const foundVerb = findVerb(found, verb);
    if (foundVerb === undefined) {
        return `blong-dev ${command}: no verb "${verb}"\n\n${renderCommand(found)}`;
    }
    return renderVerb(found, foundVerb);
}

/**
 * The help a command line asks for, or `undefined` when it asks for none.
 *
 * `help`, `--help` and `-h` all ask. With a command and a verb named, the verb's own
 * help is the answer; with only a command, its verb list. A command whose first
 * positional is a required verb (`helpOnBare`) answers a bare invocation with its own
 * help rather than an error.
 */
export function resolveHelp(
    command: string | undefined,
    args: readonly string[],
): {command?: string; verb?: string} | undefined {
    if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
        const [named, verb] = command === undefined ? [] : args;
        // `blong-dev help` (no argument) is the command list; a bare `blong-dev` is too.
        return named === undefined ? {} : {command: named, ...(verb ? {verb} : {})};
    }
    const asked = args.some(arg => arg === 'help' || arg === '--help' || arg === '-h');
    const found = findCommand(command);
    if (!asked) {
        return args.length === 0 && found?.helpOnBare ? {command} : undefined;
    }
    const verb = (found?.verbs ?? []).find(candidate => args.includes(candidate.name))?.name;
    return {command, ...(verb ? {verb} : {})};
}

/**
 * The line a usage error ends with: where the parameters are documented.
 *
 * A missing or malformed argument is the commonest way to get a usage error, so the
 * answer is the help for exactly the verb that was being called.
 */
export function usageHint(command: string, verb?: string): string {
    const target = verb === undefined ? command : `${command} ${verb}`;
    return `Run \`blong-dev ${target} --help\` to see its parameters.`;
}

/** One option's row: the flag and its description, wrapped under the description column. */
function optionsOf(options: readonly IHelpOption[] | undefined): [string, string][] {
    return (options ?? []).map(option => [option.flag, option.description]);
}

/** An `Examples:` block, one command per line. */
function examplesOf(examples: readonly string[] | undefined): string[] {
    if (examples === undefined || examples.length === 0) return [];
    return ['', 'Examples:', ...examples.map(example => `  ${example}`)];
}
