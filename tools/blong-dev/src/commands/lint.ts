import {lintCollect, type Diagnostic} from '@feasibleone/blong-lint';
import {fileURLToPath} from 'node:url';

// Tools bundled with blong-dev (cspell, eslint, tsc) live in blong-dev's own
// node_modules. lint.ts is at src/commands/lint.ts → ../../node_modules/.bin is
// the package root's bin dir.
const blongDevBin = fileURLToPath(new URL('../../node_modules/.bin', import.meta.url));

const TS_EXT = /\.[cm]?tsx?$/i;

function formatDiagnostic(diagnostic: Diagnostic): string {
    const location =
        diagnostic.file == null
            ? ''
            : `${diagnostic.file}${diagnostic.line == null ? '' : `:${diagnostic.line}`}${
                  diagnostic.column == null ? '' : `:${diagnostic.column}`
              }  `;
    const rule = diagnostic.rule ? ` [${diagnostic.rule}]` : '';
    const mark = diagnostic.severity === 'warning' ? '⚠' : '✖';
    return `  ${mark} ${location}${diagnostic.tool}${rule}: ${diagnostic.message}`;
}

/**
 * Run lint tools in the current working directory.
 *
 * Thin CLI wrapper over `@feasibleone/blong-lint`'s `lintCollect`: this owns the
 * terminal presentation and the exit code; the package owns tool discovery and
 * output parsing (shared with the `blong-kukum` API surface).
 *
 * @param fileArgs - Optional list of files to lint (paths relative to CWD).
 *   When supplied (staged-file mode), tsc still runs on the full package but
 *   cspell and eslint are scoped to these files only.
 *   When omitted (full-package mode), all tools run with their default scope.
 */
export async function lint(fileArgs: string[]): Promise<void> {
    const cwd = process.cwd();
    const staged = fileArgs.length > 0;
    const tsFiles = staged ? fileArgs.filter(f => TS_EXT.test(f)) : [];

    const {diagnostics, exitCode, ran} = await lintCollect(cwd, {
        files: staged ? fileArgs : undefined,
        scope: staged ? 'changed' : 'package',
        binPaths: [blongDevBin],
    });

    for (const diagnostic of diagnostics) console.log(formatDiagnostic(diagnostic));

    if (diagnostics.length === 0) {
        for (const tool of ran) {
            const scope =
                tool === 'tsc'
                    ? staged
                        ? `${tsFiles.length} file(s)`
                        : 'full package'
                    : staged
                      ? `${fileArgs.length} file(s)`
                      : 'full package';
            console.log(`  ✓ ${tool}: ${scope}`);
        }
    } else {
        const errors = diagnostics.filter(d => d.severity === 'error').length;
        const warnings = diagnostics.length - errors;
        console.log(`  ${errors} error(s), ${warnings} warning(s)`);
    }

    if (exitCode !== 0) process.exit(exitCode);
}
