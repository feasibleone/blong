/**
 * Where a signal was reached or declared from.
 *
 * One capture, used by the proxy (the call's origin) and by a declaration (the site a duplicate is
 * reported against), so a reader of either sees the same shape. The owner chose the file as
 * sufficient and the whole frame list as a debugging opt-in (`@@D-892`).
 */

/** Where a signal was reached from, or declared at. */
export interface ISite {
    /** The source file, as the stack reports it. */
    file: string;
    /** The line, when the frame reports one. */
    line?: number;
    /** The enclosing function, when the frame names it. */
    function?: string;
    /** The whole frame list, only when `captureStack` asked for it. */
    stack?: string[];
}

/** This module's own path, which is never the caller. */
const OWN_FILE = import.meta.url.replace(/^file:\/\//, '');

/** A stack frame written as `at function (file:line:column)` or `at file:line:column`. */
const FRAME = /^\s*at\s+(?:(?<function>.+?)\s+\()?(?<file>[^()]+?):(?<line>\d+):(?<column>\d+)\)?$/;

/**
 * The frames belonging to this package, which are never the caller's.
 *
 * A test that lives inside the package is a caller like any other — the realm that will use this
 * code is elsewhere, but the tests are here — so test files are exempt.
 */
const PACKAGE = /[\\/](?:core[\\/]lukaot|node_modules[\\/]@feasibleone[\\/]lukaot)[\\/]/;

/** A frame of this package's own code, as opposed to one of its tests. */
function isOwnCode(frame: string): boolean {
    return (frame.includes(OWN_FILE) || PACKAGE.test(frame)) && !/\.test\.ts/.test(frame);
}

/** The frame list, without this package's own frames. */
function callerFrames(): string[] {
    const frames = new Error().stack?.split('\n') ?? [];
    return frames
        .slice(1)
        .map(frame => frame.trim())
        .filter(frame => !isOwnCode(frame));
}

/** The first frame that is not this package's own code, as a site. */
export function captureSite(keepStack = false): ISite | undefined {
    const frames = callerFrames();
    for (const frame of frames) {
        const match = FRAME.exec(frame);
        const file = match?.groups?.['file']?.trim();
        if (!file || file.startsWith('node:')) continue;
        return {
            file,
            line: match?.groups?.['line'] === undefined ? undefined : Number(match.groups['line']),
            function: match?.groups?.['function']?.trim(),
            ...(keepStack ? {stack: frames} : {}),
        };
    }
    return undefined;
}

/** A site as one short string, for a message that has to name two of them. */
export function describeSite(site: ISite | undefined): string {
    if (!site) return 'an unknown site';
    const file = site.file.replace(/^file:\/\//, '');
    return site.line === undefined ? file : `${file}:${site.line}`;
}
