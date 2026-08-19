/**
 * Shared `--help` handling for the `blong` / `blong-watch` CLIs.
 *
 * Both binaries hand-roll their argument parsing with `minimist`, which treats
 * `--help`/`-h` as unused named flags. Without this short-circuit the CLI falls
 * through to `autoRun`, finds no suite entry point in the working directory and
 * throws — which looks like a crash. The check must run before the realm-create
 * and `autoRun` logic so help works from any directory.
 */

export const USAGE = `blong — run a Blong suite / realm (intents are positional arguments)

Usage:
  blong                          Run the suite in the current folder
                                 (default intents: microservice + integration + dev)
  blong <file> [intents...]      Run a specific suite file (e.g. ./server.ts)
  blong <intent>...              Run with only the given intents (e.g. integration)
  blong realm <name> [--object]  Scaffold a new realm
  blong create realm <name>      Scaffold a new realm

Well-known intents:
  dev            Development — verbose logs, hot reload
  integration    Integration testing — watch + test reruns
  microservice   Run a realm as a standalone microservice
  prod           Production / UAT
  db             Database creation / seeding (short-lived)
  debug          Enable /api/sys/* introspection + stack traces

Options:
  --help, -h     Show this help and exit
`;

/** True when the parsed argv contains `--help` or `-h`. */
export function shouldShowHelp(argv: Record<string, unknown>): boolean {
    return argv.help === true || argv.h === true;
}

/**
 * Write the usage text to stdout. `onFlushed` runs after the write has been
 * flushed so piping the output to another process cannot be truncated by an
 * immediate `process.exit()`.
 */
export function printUsage(onFlushed?: () => void): void {
    process.stdout.write(USAGE, onFlushed);
}
