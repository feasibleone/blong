import {isAbsolute, join, posix, relative} from 'node:path';

/**
 * Where a request points inside the served directory, with the two refusals a static server owes.
 *
 * A path is resolved lexically and then checked against the root, and a `..` segment is refused
 * rather than normalised away: normalising answers a path inside the root, which turns an attempt
 * into an ordinary request and hides it from every log that reads the URL afterwards. The check is
 * repeated on the filesystem path ({@link toFileSystemPath}) because two spellings of one path can
 * still disagree about where the join landed.
 *
 * The returned path is relative and uses `/`, which is what `reply.sendFile` wants; the caller
 * decides whether a directory means `index.html`.
 */
export interface IResolvedTarget {
    /** Path inside the root, POSIX separators and no leading slash. */
    relativePath: string;
    /** The request named a directory (it ended in `/`, or named the base itself). */
    directory: boolean;
}

/**
 * The prefix the bundle answers under, always with a trailing slash.
 *
 * A build's own `base` (`/s/` in `core/blong-browser/src/vite.ts`) is a prefix, so the two spellings
 * a browser produces are `/s/` and `/s`; the normal form is the first, and the server redirects the
 * second rather than serving it twice.
 */
export const normalizeBase = (base: string): string => {
    const trimmed = base.trim() || '/';
    const leading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return leading.endsWith('/') ? leading : `${leading}/`;
};

/** The base without its trailing slash, which is the address that redirects to it. */
export const baseWithoutSlash = (base: string): string =>
    normalizeBase(base).replace(/\/$/, '') || '/';

/**
 * Resolve a request URL against a base, or answer `undefined` when it is not one this server serves.
 *
 * `undefined` is the traversal answer, and the caller treats it as a refusal. A URL outside the base
 * is a different kind of miss — the server registers one wildcard per base, so this only happens
 * when it is asked directly — and it is refused the same way rather than leaking which prefixes
 * exist.
 */
export const resolveRelativePath = (base: string, url: string): IResolvedTarget | undefined => {
    const prefix = normalizeBase(base);
    const withoutQuery = url.split('?')[0]?.split('#')[0] ?? '';
    if (withoutQuery.includes('\0') || withoutQuery.includes('\\')) return undefined;

    let pathname: string;
    try {
        // Decoded once, so the segment checks below see the characters the browser meant rather
        // than the escapes it wrote them with.
        pathname = decodeURIComponent(withoutQuery);
    } catch {
        return undefined;
    }
    if (pathname.includes('\0') || pathname.includes('\\')) return undefined;
    // A *second* encoding of a dot or a separator is refused too: nothing downstream decodes this
    // path again, so `%2e%2e` would be a harmless filename — but a name no build produces, and one
    // whose meaning depends on how many times something later decodes it. Refusing it keeps the
    // answer true whatever the layers in between do.
    if (/%(2e|2f|5c)/i.test(pathname)) return undefined;

    const prefixNoSlash = baseWithoutSlash(prefix);
    if (pathname !== prefixNoSlash && !pathname.startsWith(prefix)) return undefined;

    const tail = pathname === prefixNoSlash ? '' : pathname.slice(prefix.length);
    const segments = tail.split('/');
    // A dot segment never names a file a build produced, and `..` is the traversal itself. Refusing
    // both keeps the answer independent of how the filesystem happens to normalise them.
    if (segments.some(segment => segment === '.' || segment === '..')) return undefined;
    // A drive letter or a UNC prefix has no meaning to a POSIX build, and on a platform that has
    // one it would escape the root through `join`.
    if (segments[0] !== undefined && /^[a-zA-Z]:/.test(segments[0])) return undefined;

    const relativePath = tail === '' ? '' : posix.normalize(tail).replace(/^\/+|\/+$/g, '');
    if (relativePath === '..' || relativePath.startsWith('../')) return undefined;

    return {
        relativePath,
        directory: relativePath === '' || pathname.endsWith('/'),
    };
};

/**
 * The filesystem path for a resolved request, or `undefined` when the join leaves the root.
 *
 * The second half of the traversal guard: {@link resolveRelativePath} refuses the spellings a URL
 * can carry, and this refuses a root that is itself relative (a working directory that moved), and
 * any join that lands outside it.
 */
export const toFileSystemPath = (root: string, relativePath: string): string | undefined => {
    const filePath = join(root, ...relativePath.split('/').filter(Boolean));
    const inside = relative(root, filePath);
    if (inside.startsWith('..') || isAbsolute(inside)) return undefined;
    return filePath;
};
