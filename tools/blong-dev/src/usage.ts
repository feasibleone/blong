/**
 * The published face of the `blong-dev` help.
 *
 * Help is rendered from the registry in `help/commands.ts` at three levels: the
 * command list, one command with its verbs, and one verb with its parameters. This
 * module is what the CLI and the commands import, so a command never carries its own
 * usage text and the text it prints cannot drift from what it parses.
 *
 * `USAGE_LINES` is kept for the callers that only want a one-line-per-command index.
 */

import {COMMANDS} from './help/commands.ts';
import {renderIndex} from './help/render.ts';

export {
    commandNames,
    findCommand,
    findVerb,
    helpText,
    renderCommand,
    renderIndex,
    renderVerb,
    resolveHelp,
    usageHint,
} from './help/render.ts';
export type {IHelpCommand, IHelpOption, IHelpVerb} from './help/types.ts';
export {COMMANDS};

/** One line per command, for a caller that wants the list without the prose. */
export const USAGE_LINES: readonly string[] = COMMANDS.map(
    command => `  blong-dev ${command.name}  ${command.summary}`,
);

/** Write the command list (level 1) to the given stream. */
export function writeUsage(stream: NodeJS.WriteStream): void {
    stream.write(renderIndex());
}

/** Write the unknown-command error followed by the command list. */
export function writeUnknownCommand(stream: NodeJS.WriteStream, command?: string): void {
    stream.write(`blong-dev: Unknown command "${command ?? ''}"\n\n`);
    stream.write(renderIndex());
}
