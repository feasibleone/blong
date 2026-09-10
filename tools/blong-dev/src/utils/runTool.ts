import {spawn} from 'node:child_process';

export interface RunOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}

/**
 * Spawns a tool and inherits stdio so output flows directly to the terminal.
 * Returns the process exit code (0 = success).
 */
export function runTool(
    command: string,
    args: string[],
    options: RunOptions = {},
): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            cwd: options.cwd ?? process.cwd(),
            env: options.env ?? process.env,
        });
        child.on('error', reject);
        child.on('close', code => resolve(code ?? 0));
    });
}
