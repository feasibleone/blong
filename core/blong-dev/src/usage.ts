/**
 * Shared usage text for the `blong-dev` CLI.
 *
 * Printed to stdout on `--help` / `-h` / `help` (exit 0) and to stderr on an
 * unknown command (exit 1). Keeping the text in one module makes it testable and
 * guarantees every subcommand (including `sql`) is listed everywhere.
 */

export const USAGE_LINES: readonly string[] = [
    '  blong-dev lint [files...]    Run tsc + cspell + eslint in current package',
    '  blong-dev lint-staged        Lint git staged files across all affected packages',
    '  blong-dev test               Run tap tests in current package',
    '  blong-dev playwright [args]  Run Playwright tests in current package',
    '  blong-dev proxy [opts]       MLE proxy for curl (--port/--target/--username/--password)',
    '  blong-dev trace <trace.zip>  Print a human-readable Playwright trace timeline',
    '  blong-dev log [ulid] [opts]  Fetch log entries from cacache (--output/--level/--search/...)',
    '  blong-dev sql [opts]         Run a SQL query via .blong_devrc (--output json|pretty)',
];

/** Write the usage list (with a `Usage:` header) to the given stream. */
export function writeUsage(stream: NodeJS.WriteStream): void {
    stream.write('Usage:\n');
    for (const line of USAGE_LINES) stream.write(line + '\n');
}

/** Write the unknown-command error followed by the usage list. */
export function writeUnknownCommand(stream: NodeJS.WriteStream, command?: string): void {
    stream.write(`blong-dev: Unknown command "${command ?? ''}"\n`);
    writeUsage(stream);
}
