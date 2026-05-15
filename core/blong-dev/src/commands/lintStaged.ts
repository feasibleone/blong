import {execSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import stripJsonComments from 'strip-json-comments';
import {findUp} from '../utils/findConfig.ts';
import {runTool} from '../utils/runTool.ts';

interface RushProject {
    packageName?: string;
    projectFolder: string;
}

interface RushConfig {
    projects: RushProject[];
}

const PATH_SEP = process.platform === 'win32' ? ';' : ':';

/**
 * Pre-commit lint-staged command.
 *
 * Reads the list of staged files from git, maps each file to its owning
 * Rush project (longest-prefix match on projectFolder), then invokes
 * `blong-dev lint <files>` in each affected package directory.
 *
 * Intended to be called from the pre-commit git hook:
 *   node common/scripts/install-run-rush.js lint-staged
 * or directly from a Rush global command backed by blong-dev.
 */
export async function lintStaged(): Promise<void> {
    const cwd = process.cwd();

    // Locate the repo root via rush.json
    const rushJsonPath = findUp(cwd, 'rush.json');
    if (!rushJsonPath) {
        process.stderr.write('blong-dev: Could not find rush.json — not in a Rush workspace\n');
        process.exit(1);
    }
    const repoRoot = dirname(rushJsonPath);

    // Parse rush.json (JSONC format)
    const rushConfig = JSON.parse(
        stripJsonComments(readFileSync(rushJsonPath, 'utf8')),
    ) as RushConfig;

    // Get the list of staged files relative to the repo root
    let staged: string[];
    try {
        staged = execSync('git diff --cached --name-only --diff-filter=ACMR', {
            cwd: repoRoot,
            encoding: 'utf8',
        })
            .trim()
            .split('\n')
            .filter(Boolean);
    } catch {
        process.stderr.write('blong-dev: Failed to enumerate staged files\n');
        process.exit(1);
    }

    if (staged.length === 0) return; // nothing staged

    // Group staged files by their owning Rush project using longest-prefix match
    const byProject = new Map<string, string[]>();
    for (const file of staged) {
        const owner = rushConfig.projects
            .filter(p => file.startsWith(p.projectFolder + '/'))
            .sort((a, b) => b.projectFolder.length - a.projectFolder.length)[0];
        if (owner) {
            const relFile = relative(owner.projectFolder, file);
            const existing = byProject.get(owner.projectFolder) ?? [];
            existing.push(relFile);
            byProject.set(owner.projectFolder, existing);
        }
    }

    if (byProject.size === 0) return; // staged files outside any known package

    // Path to this blong-dev CLI binary (resolved from the compiled file's
    // real location so it works correctly even when invoked via symlink).
    const blongDevCli = fileURLToPath(new URL('../../bin/blong-dev.ts', import.meta.url));

    let failed = false;
    for (const [projectFolder, files] of byProject) {
        const pkgDir = join(repoRoot, projectFolder);
        // Prepend the package's own node_modules/.bin so it can find tsc/cspell/eslint
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            PATH: [join(pkgDir, 'node_modules', '.bin'), process.env['PATH'] ?? ''].join(PATH_SEP),
        };
        const code = await runTool(process.execPath, [blongDevCli, 'lint', ...files], {
            cwd: pkgDir,
            env,
        });
        if (code !== 0) failed = true;
    }

    if (failed) process.exit(1);
}
