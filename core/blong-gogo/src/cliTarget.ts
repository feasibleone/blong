/**
 * Which positional argument names a target, and which are intents.
 *
 * `blong` and `blong-watch` take an optional file or folder to run and then a list of intents, and the
 * two are told apart by **shape**, not by the filesystem: a positional that names a path carries a
 * separator (`dev/`, `./dev`, `../realm/suite`, `/opt/deploy/suite`) and is a target when it exists; a
 * bare word is always an intent.
 *
 * Asking the filesystem instead made the answer depend on the working directory. A realm whose blob
 * store lives in `dev/blob` grows a folder called `dev`, and `blong dev` then resolved to *that folder*:
 * the loader imported a directory and failed with `ERR_UNSUPPORTED_DIR_IMPORT` while the command read as
 * the `dev` intent. A name cannot be both, and the intent wins because it is the argument a person
 * types — a directory is something they spell as one (`./dev`) when they mean it.
 *
 * Pure, and separate from the binaries, so both use one rule and a test can pin it.
 */
export const isTargetArgument = (value: string | undefined): value is string =>
    typeof value === 'string' && (value.includes('/') || value.includes('\\'));

/** True when the argument names a path this folder actually holds. */
export function resolveTarget(
    positionals: readonly string[],
    exists: (path: string) => boolean,
): {target?: string; intents: string[]} {
    const [first, ...rest] = positionals;
    if (isTargetArgument(first) && exists(first)) return {target: first, intents: [...rest]};
    return {intents: [...positionals]};
}
