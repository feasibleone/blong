/**
 * devrc — reading a developer-local `.blong_devrc`.
 *
 * The file is looked up from the working directory upwards, which reaches
 * `~/.blong_devrc` because a checkout under the home directory passes through
 * the home directory on the way to the filesystem root.  Both
 * JSON-with-comments and YAML are accepted, mirroring blong-config.
 *
 * Extracted from `commands/sql.ts` so that a non-CLI consumer — the Storybook
 * live-backend plugin in `blong-browser` — can read the same file through the
 * `@feasibleone/blong-dev/devrc` subpath without pulling in the whole dev CLI
 * (whose root entry transitively reaches eslint, cspell and allure).
 */
import {readFileSync} from 'node:fs';
import stripJsonComments from 'strip-json-comments';
import yaml from 'yaml';
import {findUp} from './utils/findConfig.ts';

export {findUp};

/** Parse `.blong_devrc` content (JSON-with-comments or YAML), mirroring blong-config. */
export function parseDevRc(content: string): Record<string, unknown> {
    if (/^\s*{/.test(content)) {
        return JSON.parse(stripJsonComments(content)) as Record<string, unknown>;
    }
    const result = yaml.parse(content);
    return result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
}

/** Resolve a dot path (e.g. `srv.db`) on the parsed config. */
export function getPath(config: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
        return undefined;
    }, config);
}

/**
 * Locate and parse `.blong_devrc`, starting at `cwd` (default: the process
 * working directory).  Returns `undefined` when there is no such file, which
 * callers treat as "no local configuration" rather than an error.
 */
export function loadDevRc(
    cwd: string = process.cwd(),
    filename = '.blong_devrc',
): {path: string; config: Record<string, unknown>} | undefined {
    const path = findUp(cwd, filename);
    if (!path) return undefined;
    return {path, config: parseDevRc(readFileSync(path, 'utf8'))};
}
