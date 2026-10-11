/**
 * The publish surfaces of this repository, read rather than assumed.
 *
 * A package declares what a consumer may import in `exports` (and `main`, `types`, `bin`), and
 * `.npmignore` decides what actually travels in the tarball. The two are maintained by hand in different
 * files, so they drift, and nothing inside the repository can see it happen: every resolution here goes
 * through the workspace, so a published package is only ever consumed from the outside. Four of the seven
 * packages that declare `ci-publish` were missing entry points their own manifests declared —
 * `@feasibleone/semantic-log` published three of the five the `exports` map names, and `blong-login` and
 * `blong-openapi` published three files of metadata, because Rush's template allow-list keeps `bin`, `lib`
 * and `dist`, a compiled layout this repository does not have (F-488).
 *
 * This module is the reading half of the guard: which targets a manifest declares, what an allow-list
 * covers, and which of those a packed tarball holds. `commands/publish.ts` runs it against a real `npm
 * pack`, and the tests own both halves.
 */

/** A project as `rush.json` lists it, which is where every package that could publish is enumerated. */
export interface IRushProject {
    projectFolder: string;
    packageName: string;
    shouldPublish: boolean;
}

/**
 * `rush.json` is JSONC: it carries the template's comments. A parser is not worth a dependency here, so the
 * comments are dropped before `JSON.parse` — with the string state tracked, because a `//` inside a value
 * (a URL, a glob) is not a comment.
 */
export const stripJsonComments = (text: string): string => {
    let out = '';
    let inString = false;
    let escaped = false;
    for (let at = 0; at < text.length; at++) {
        const char = text[at];
        const next = text[at + 1];
        if (inString) {
            out += char;
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            out += char;
            continue;
        }
        if (char === '/' && next === '/') {
            while (at < text.length && text[at] !== '\n') at++;
            out += '\n';
            continue;
        }
        if (char === '/' && next === '*') {
            at += 2;
            while (at < text.length && !(text[at] === '*' && text[at + 1] === '/')) at++;
            at++;
            continue;
        }
        out += char;
    }
    return out;
};

/** Every project `rush.json` lists, in the order it lists them. */
export const parseRushProjects = (rushJson: string): IRushProject[] => {
    const parsed = JSON.parse(stripJsonComments(rushJson)) as {projects?: IRushProject[]};
    return (parsed.projects ?? []).map(project => ({
        projectFolder: project.projectFolder,
        packageName: project.packageName,
        shouldPublish: Boolean(project.shouldPublish),
    }));
};

/**
 * The paths a manifest promises a consumer: every string in `exports`, and the same for `bin`, `main`,
 * `types` and `module`. Normalised without the leading `./` and sorted, because a set is what a check
 * compares against.
 */
export const declaredTargets = (manifest: {
    exports?: unknown;
    bin?: unknown;
    main?: unknown;
    types?: unknown;
    module?: unknown;
}): string[] => {
    const found = new Set<string>();
    const walk = (node: unknown): void => {
        if (typeof node === 'string') found.add(node.replace(/^\.\//, ''));
        else if (node && typeof node === 'object') for (const value of Object.values(node)) walk(value);
    };
    for (const key of ['exports', 'bin', 'main', 'types', 'module'] as const) walk(manifest[key]);
    return [...found].sort();
};

/** The patterns an `.npmignore` allow-list brings back: its `!pattern` lines, without the `!`. */
export const whitelistPatterns = (ignoreText: string): string[] => [
    ...new Set(
        ignoreText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('!') && line.length > 1)
            .map(line => line.slice(1)),
    ),
].sort();

/** A pattern as a regular expression, with the glob rules npm uses for an ignore file. */
const patternToRegExp = (pattern: string): RegExp => {
    const anchored = pattern.startsWith('/');
    const body = pattern.replace(/^\//, '');
    const escaped = body
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(/\u0000/g, '.*');
    // A pattern without a slash matches at any depth; one with a slash, or a leading slash, is rooted.
    const prefix = anchored || body.includes('/') ? '^' : '^(?:.*/)?';
    return new RegExp(`${prefix}${escaped}$`);
};

/** Does this allow-list pattern cover that target? */
export const patternCovers = (pattern: string, target: string): boolean =>
    patternToRegExp(pattern).test(target);

/** The state of one declared target, which is what the check decides on. */
export interface ITargetState {
    target: string;
    /** Present in the package as it is checked out: a `dist/` target is there only once something built. */
    present: boolean;
    /** Covered by the `.npmignore` allow-list, i.e. not filtered out of the tarball. */
    allowed: boolean;
    /** Named by the files a pack would produce. */
    published: boolean;
}

/**
 * Compare what a manifest declares against what a pack would release.
 *
 * `present` is injected rather than read here so the rules stay testable without a filesystem, and so the
 * caller can say what "present" means where it runs.
 */
export const targetStates = (
    declared: string[],
    packed: string[],
    whitelist: string[],
    present: (target: string) => boolean = () => true,
): ITargetState[] =>
    declared.map(target => ({
        target,
        present: present(target),
        allowed: whitelist.some(pattern => patternCovers(pattern, target)),
        published: packed.includes(target),
    }));

/**
 * The failure the guard exists for: a declared target that is **here** and still not in the tarball.
 *
 * A target that is declared and absent is a different matter — `dist/` is build output, gitignored, and a
 * checkout that has not built is allowed to lack it — so it is reported as `not built here` instead of
 * failing the check.
 */
export const unpublishedTargets = (states: ITargetState[]): string[] =>
    states.filter(state => state.present && !state.published).map(state => state.target);

/** Declared targets this checkout does not have, which a pack therefore cannot release. */
export const unbuiltTargets = (states: ITargetState[]): string[] =>
    states.filter(state => !state.present).map(state => state.target);
