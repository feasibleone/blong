import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hasEslintConfig, hasTsConfig} from '../utils/discover.ts';
import {findUp} from '../utils/findConfig.ts';
import {runTool, type RunOptions} from '../utils/runTool.ts';

// Tools bundled with blong-dev (e.g. cspell) live in blong-dev's own node_modules.
// lint.ts is at src/commands/lint.ts → ../../node_modules/.bin is the package root's bin dir.
const blongDevBin = fileURLToPath(new URL('../../node_modules/.bin', import.meta.url));

const TS_EXT = /\.[cm]?tsx?$/i;
const SPELL_EXT = /\.([cm]?tsx?|md)$/i;
const LINT_EXT = /\.[cm]?[jt]sx?$/i;
const PATH_SEP = process.platform === 'win32' ? ';' : ':';

/**
 * Run lint tools in the current working directory.
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
    const spellFiles = staged ? fileArgs.filter(f => SPELL_EXT.test(f)) : [];
    const lintFiles = staged ? fileArgs.filter(f => LINT_EXT.test(f)) : [];

    // Augment PATH: target package's .bin first, then blong-dev's own .bin
    // (provides cspell and other bundled tools), then the inherited PATH.
    const localBin = join(cwd, 'node_modules', '.bin');
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: [localBin, blongDevBin, process.env['PATH'] ?? ''].join(PATH_SEP),
    };
    const run = (cmd: string, args: string[]) =>
        runTool(cmd, args, {cwd, env} satisfies RunOptions);

    const ok = (tool: string, scope: string) => console.log(`  ✓ ${tool}: ${scope}`);

    let exitCode = 0;

    // ── tsc ──────────────────────────────────────────────────────────────────
    // Always runs on the full package — passing individual files to tsc breaks
    // tsconfig inheritance and cross-file type resolution.
    // Skipped in staged mode if none of the staged files are TypeScript.
    if (hasTsConfig(cwd) && (!staged || tsFiles.length > 0)) {
        const code = await run('tsc', ['--noEmit']);
        if (code !== 0) exitCode = code;
        else ok('tsc', staged ? `${tsFiles.length} file(s)` : 'full package');
    }

    // ── cspell ───────────────────────────────────────────────────────────────
    // Always applicable — uses the repo-level cspell.config.yaml found by
    // walking up from CWD.  In staged mode, only the staged TS/MD files are
    // checked.  In full-package mode, all .ts/.tsx/.md files are checked.
    {
        const cspellConfig = findUp(cwd, 'cspell.config.yaml');
        const args = ['--no-progress', '--no-summary', '--no-must-find-files'];
        if (cspellConfig) args.push('--config', cspellConfig);
        const spellTargets =
            spellFiles.length > 0 ? spellFiles : ['**/*.ts', '**/*.tsx', '**/*.md'];
        args.push(...spellTargets);

        const code = await run('cspell', args);
        if (code !== 0) exitCode = code;
        else ok('cspell', staged ? `${spellFiles.length} file(s)` : '**/*.ts, **/*.tsx, **/*.md');
    }

    // ── eslint ───────────────────────────────────────────────────────────────
    // Applied only when an ESLint config file is present in the package root.
    if (hasEslintConfig(cwd)) {
        const targets = staged ? lintFiles : ['.'];
        if (targets.length > 0) {
            const code = await run('eslint', ['--max-warnings', '0', ...targets]);
            if (code !== 0) exitCode = code;
            else ok('eslint', staged ? `${lintFiles.length} file(s)` : 'full package');
        }
    }

    if (exitCode !== 0) process.exit(exitCode);
}
