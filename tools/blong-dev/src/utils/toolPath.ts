/**
 * PATH handling for the tools `blong-dev` shells out to (`tap`, `playwright`,
 * `allure`, `c8`…).
 *
 * Each package's `node_modules/.bin` comes first, then blong-dev's own, so a
 * package can pin a version while the blong-dev-provided tools still resolve.
 */

import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const blongDevBin = fileURLToPath(new URL('../../node_modules/.bin', import.meta.url));
const PATH_SEP = process.platform === 'win32' ? ';' : ':';

/** Environment for spawning a tool in `cwd`, with the tool bins on PATH. */
export function toolEnv(cwd: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const localBin = join(cwd, 'node_modules', '.bin');
    return {
        ...process.env,
        ...extra,
        PATH: [localBin, blongDevBin, process.env['PATH'] ?? ''].join(PATH_SEP),
    };
}
