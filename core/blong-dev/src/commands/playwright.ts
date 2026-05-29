import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runTool, type RunOptions} from '../utils/runTool.ts';

const blongDevBin = fileURLToPath(new URL('../../node_modules/.bin', import.meta.url));
const PATH_SEP = process.platform === 'win32' ? ';' : ':';

/**
 * Run Playwright tests in the current working directory.
 *
 * Resolves the Playwright CLI from the package's own node_modules first,
 * then falls back to blong-dev's bundled binary.
 */
export async function playwright(args: string[]): Promise<void> {
    const cwd = process.cwd();
    const localBin = join(cwd, 'node_modules', '.bin');
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: [localBin, blongDevBin, process.env['PATH'] ?? ''].join(PATH_SEP),
    };
    const run = (cmd: string, args: string[]) =>
        runTool(cmd, args, {cwd, env} satisfies RunOptions);

    const exitCode = await run('playwright', ['test', ...args]);

    process.exitCode = exitCode;
}
