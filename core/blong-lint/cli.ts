import {parseLintArgs} from './args.ts';
import {formatDiagnostic, lintCollect, lintFix, missingFiles, type LintTool} from './index.ts';

/**
 * Terminal presentation for the lint tools.
 *
 * This is the CLI half of the package: {@link parseLintArgs} reads the command
 * line, {@link lintCollect} discovers the tools and parses their output, and this
 * decides what a human sees and what the process exits with.
 *
 * It lives here rather than in `blong-dev` because this package has to be able to
 * lint **itself**, and `blong-dev` depends on this package — depending back on it
 * would be a workspace cycle, which pnpm now reports. `blong-dev lint` still gets
 * the same behaviour by passing its own bundled `binPaths` and the pinned
 * prettier.
 */

export interface LintCliOptions {
    /** Directory to lint. Defaults to the current working directory. */
    cwd?: string;
    /** Extra `node_modules/.bin` directories, searched before this package's. */
    binPaths?: string[];
    /**
     * Absolute path of the pinned prettier, for `--fix`.
     *
     * Deliberately not discovered here: the repository pins prettier in a rush
     * autoinstaller, which only the caller knows how to locate, and a package's own
     * copy is a different major that rewrites list markers and prose wraps.
     */
    prettierBin?: string;
}

const TS_EXT = /\.[cm]?tsx?$/i;

/**
 * Lint the files `argv` names (or the whole package when it names none) and print
 * the result.
 *
 * Exits with the tools' status code, so a caller that only wants the behaviour is
 * a single awaited line. Arguments the command does not understand, paths that do
 * not exist, and a run where no tool could look at anything are all refused: a
 * linter that silently checks nothing is worse than one that refuses the argument.
 *
 * @param argv - Everything after the command word. `--files a,b`, `--files=a,b`,
 *   repeated `--files`, bare paths and `--fix` are all understood.
 */
export async function lintCli(argv: string[], options: LintCliOptions = {}): Promise<void> {
    const cwd = options.cwd ?? process.cwd();
    const {files, fix, problems} = parseLintArgs(argv);

    if (problems.length > 0) {
        for (const problem of problems) console.log(`  ✖ ${problem}`);
        console.log('  nothing was checked — correct the arguments and run again');
        process.exit(1);
    }

    const missing = missingFiles(cwd, files);
    if (missing.length > 0) {
        for (const file of missing) console.log(`  ✖ ${file}: no such file`);
        console.log(
            `  ${missing.length} of ${files.length} path(s) do not exist — nothing was checked`,
        );
        process.exit(1);
    }

    const staged = files.length > 0;
    // Name every path, not only a count: F-327 was a green tick over a list that had
    // been read as one non-existent path, and a reader can only tell the difference
    // when the paths are shown.
    if (staged) console.log(`  files (${files.length}): ${files.join(', ')}`);

    if (fix && staged) {
        const repaired = await lintFix(cwd, files, {
            ...(options.binPaths ? {binPaths: options.binPaths} : {}),
            ...(options.prettierBin ? {prettierBin: options.prettierBin} : {}),
        });
        for (const tool of repaired.ran) console.log(`  ✎ ${tool}`);
        for (const note of repaired.notes) console.log(`  · ${note}`);
    }

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

    if (staged && ran.length === 0) {
        console.log('  ✖ nothing was checked — no tool reads the named path(s)');
        process.exit(1);
    }

    if (exitCode !== 0) process.exit(exitCode);
}

/** What a tool actually checked, for the ✓ line. */
function scopeOf(tool: LintTool, staged: boolean, files: number, tsFiles: number): string {
    if (!staged) return 'full package';
    return tool === 'tsc' ? `${tsFiles} file(s)` : `${files} file(s)`;
}
