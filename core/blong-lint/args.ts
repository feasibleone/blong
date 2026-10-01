/**
 * Turning a lint command line into the files to check.
 *
 * The command used to hand every argument straight to the tools as a path, so
 * `--files a.md,b.md` was read as two paths — `--files` and `a.md,b.md` — neither
 * of which exists, and the run printed a green tick over nothing at all (F-327).
 * Parsing belongs here rather than in `blong-dev`, because this package has to be
 * able to lint itself and cannot depend back on it.
 *
 * The accepted spellings are deliberately generous: commas or repeated flags or
 * bare paths, because all three are what a caller reaches for, and a spelling the
 * parser did not expect must never be silently ignored.
 */

/** What a lint invocation asked for. */
export interface ILintArgs {
    /** Paths to check, de-duplicated and in the order given. */
    files: string[];
    /** Repair what can be repaired before reporting. */
    fix: boolean;
    /**
     * Usage problems, already phrased for a reader. A caller refuses the run when
     * this is non-empty: an argument the command did not understand is never
     * quietly treated as a file name.
     */
    problems: string[];
}

/** The separator a caller may use to name several paths in one argument. */
const SEPARATOR = ',';

/**
 * Parse `argv` (everything after the command word).
 *
 * `--files a,b`, `--files=a,b`, `--files a --files b` and bare paths all produce
 * the same list.
 */
export function parseLintArgs(argv: readonly string[]): ILintArgs {
    const files: string[] = [];
    const problems: string[] = [];
    let fix = false;

    const add = (value: string): void => {
        for (const part of value.split(SEPARATOR)) {
            const path = part.trim();
            // A path named twice is one path: the ✓ lines report how many files a tool
            // covered, and a doubled entry would make that count lie.
            if (path !== '' && !files.includes(path)) files.push(path);
        }
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index] ?? '';
        if (arg === '--fix') {
            fix = true;
            continue;
        }
        if (arg.startsWith('--files=')) {
            add(arg.slice('--files='.length));
            continue;
        }
        if (arg === '--files') {
            const next = argv[index + 1];
            if (next === undefined || next.startsWith('--')) {
                problems.push('--files needs a value: --files a,b or --files a --files b');
                continue;
            }
            add(next);
            index += 1;
            continue;
        }
        if (arg.startsWith('--')) {
            problems.push(`unknown option "${arg}"`);
            continue;
        }
        add(arg);
    }

    return {files, fix, problems};
}
