/**
 * The shape of the `blong-dev` help text.
 *
 * Help is data, not a string per command, so the three levels are rendered from one
 * description of the CLI: the command list, one command with its verbs, and one verb
 * with its parameters. A command that gains an option documents it here, and every
 * level that mentions it follows — which is what keeps `--help` from drifting away
 * from what the command actually parses.
 */

/** One documented parameter. */
export interface IHelpOption {
    /** The flag as it is written, with its value placeholder: `--section <name>`. */
    flag: string;
    /** What the flag does, and its default when it has one. */
    description: string;
}

/** One verb of a command (`blong-dev memory close`). */
export interface IHelpVerb {
    /** The verb as it is typed. */
    name: string;
    /** One line, shown in the command's verb list. */
    summary: string;
    /** The usage line(s), shown when the verb's own help is asked for. */
    usage: string;
    /** What the verb does, in the depth a reader of `--help` needs. */
    description?: string;
    options?: readonly IHelpOption[];
    examples?: readonly string[];
}

/** One command of the CLI. */
export interface IHelpCommand {
    /** The command as it is typed. */
    name: string;
    /** One line, shown in the command list. */
    summary: string;
    /** What the command is for, shown in the command's own help. */
    description: string;
    /** The usage line(s) of the command as a whole. */
    usage?: string;
    options?: readonly IHelpOption[];
    verbs?: readonly IHelpVerb[];
    examples?: readonly string[];
    /** A path or setting the command works with, printed under the examples. */
    note?: string;
    /**
     * Print this command's help instead of running it when no argument is given.
     *
     * Only for a command whose first positional is a required verb: a command with a
     * default verb (`ci`, `publish`) must stay runnable bare.
     */
    helpOnBare?: boolean;
}
