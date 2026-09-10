import {formatDiagnostic, lintCollect, type LintTool} from './index.ts';

/**
 * Terminal presentation for the lint tools.
 *
 * This is the CLI half of the package: {@link lintCollect} discovers the tools
 * and parses their output, this decides what a human sees and what the process
 * exits with.
 *
 * It lives here rather than in `blong-dev` because this package has to be able
 * to lint **itself**, and `blong-dev` depends on this package — depending back
 * on it would be a workspace cycle, which pnpm now reports. `blong-dev lint`
 * still gets the same behaviour by passing its own bundled `binPaths`.
 */

export interface LintCliOptions {
    /** Directory to lint. Defaults to the current working directory. */
    cwd?: string;
    /** Extra `node_modules/.bin` directories, searched before this package's. */
    binPaths?: string[];
}

const TS_EXT = /\.[cm]?tsx?$/i;

/**
 * Lint `files` (or the whole package when none are named) and print the result.
 *
 * Exits with the tools' status code, so a caller that only wants the behaviour
 * is a single awaited line.
 *
 * @param files - Files to lint, relative to `cwd`. Supplying them scopes cspell
 *   and eslint to those files while tsc still type-checks the whole package
 *   (individual files break tsconfig inheritance and cross-file resolution).
 */
export async function lintCli(files: string[], options: LintCliOptions = {}): Promise<void> {
    const cwd = options.cwd ?? process.cwd();
    const staged = files.length > 0;
    const tsFiles = staged ? files.filter(file => TS_EXT.test(file)) : [];

    const {diagnostics, exitCode, ran} = await lintCollect(cwd, {
        files: staged ? files : undefined,
        scope: staged ? 'changed' : 'package',
        ...(options.binPaths ? {binPaths: options.binPaths} : {}),
    });

    for (const diagnostic of diagnostics) console.log(formatDiagnostic(diagnostic));

    if (diagnostics.length === 0) {
        for (const tool of ran) {
            console.log(`  ✓ ${tool}: ${scopeOf(tool, staged, files.length, tsFiles.length)}`);
        }
    } else {
        const errors = diagnostics.filter(d => d.severity === 'error').length;
        console.log(`  ${errors} error(s), ${diagnostics.length - errors} warning(s)`);
    }

    if (exitCode !== 0) process.exit(exitCode);
}

/** What a tool actually checked, for the ✓ line. */
function scopeOf(tool: LintTool, staged: boolean, files: number, tsFiles: number): string {
    if (!staged) return 'full package';
    return tool === 'tsc' ? `${tsFiles} file(s)` : `${files} file(s)`;
}
