/**
 * The Storybooks the documentation site publishes, and the pages that embed them.
 *
 * A docs page can show a story instead of a picture of one: `<StorybookStory site="…" id="…" />`
 * renders the story from the published Storybook, and `docs/blong/storybook-sites.json` says which
 * Storybooks exist and how each is built. This module is the reader of that register, and it does
 * three things with it, all of them behind `blong-dev docs storybook`:
 *
 * - **Builds and stages.** Each site's own package builds its Storybook and the output is copied
 *   into `docs/blong/static/storybook/<name>/`, which is what Docusaurus serves verbatim at
 *   `/storybook/<name>/` in dev, in a build and in a deploy @@D-556.
 * - **Checks the embeds.** Every `<StorybookStory>` in the docs and the blog has to name a site the
 *   register knows and a story id the staged site actually serves. The ids come from the build's
 *   own `index.json`, so a story renamed in a package is caught here instead of by a reader looking
 *   at an empty frame.
 * - **Reports what it ships.** The staged tree is tens of megabytes, so the run says how many.
 *
 * The staged tree is deliberately not committed — a build output, and the docs build has to stay
 * free of a monorepo dependency — and one site per package rather than one composed build @@D-557.
 * A page whose site was never staged renders its poster instead of a live story, which is why
 * `docs verify` counts the embeds that rendered rather than the stories they would have loaded
 * @@D-558.
 */
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import stripJsonComments from 'strip-json-comments';

import {stripCode} from './visualPages.ts';

/** Repository-relative path of the register. */
export const STORYBOOK_MANIFEST = 'docs/blong/storybook-sites.json';

/** Where a staged site is published from, relative to the repository root. */
export const STORYBOOK_STATIC_ROOT = 'docs/blong/static/storybook';

/** One published Storybook. */
export interface IStorybookSite {
    /** Directory name under `static/storybook/`, and the `site` an embed names. */
    name: string;
    /** What the site is, for the command's summary. */
    title: string;
    /** Repository-relative package the build runs in. */
    package: string;
    /** Build command, run in {@link package}; it must write {@link output}. */
    command: string;
    /** Directory the command writes, relative to {@link package}. */
    output: string;
}

/** One `<StorybookStory>` on a page. */
export interface IStorybookEmbed {
    /** Repository-relative path of the page that carries it. */
    file: string;
    /** The `site` it names, or the empty string when the attribute is missing. */
    site: string;
    /** The `id` it names, or the empty string when the attribute is missing. */
    id: string;
}

/**
 * The tag that embeds a story. Attributes are read from the tag's own text.
 *
 * A negated character class matches newlines, so a tag an author spread over several lines — one
 * attribute per line is what a reader of the source prefers — is read as one tag, the same way the
 * MDX parser reads it.
 */
const EMBED_TAG = /<StorybookStory\b[^>]*>/g;

/** A quoted attribute of that tag. */
const ATTRIBUTE = /([A-Za-z][\w-]*)\s*=\s*"([^"]*)"/g;

/** Read and validate the register. */
export function loadStorybookSites(root: string): IStorybookSite[] {
    const file = join(root, STORYBOOK_MANIFEST);
    if (!existsSync(file)) {
        process.stderr.write(`blong-dev docs: no Storybook register at ${STORYBOOK_MANIFEST}\n`);
        process.exit(1);
    }
    let parsed: unknown;
    try {
        // JSONC, like the artefact register, so a maintainer can comment a site out while
        // investigating it.
        parsed = JSON.parse(stripJsonComments(readFileSync(file, 'utf8')));
    } catch (error) {
        process.stderr.write(
            `blong-dev docs: ${STORYBOOK_MANIFEST} is not valid JSON — ${(error as Error).message}\n`,
        );
        process.exit(1);
    }
    const sites = (parsed as {sites?: unknown}).sites;
    if (!Array.isArray(sites)) {
        process.stderr.write(`blong-dev docs: ${STORYBOOK_MANIFEST} has no "sites" array\n`);
        process.exit(1);
    }
    return sites.map((entry, index) => validate(entry, index));
}

/** Reject a malformed entry with enough context to fix it without opening this file. */
function validate(entry: unknown, index: number): IStorybookSite {
    const fail = (problem: string): never => {
        process.stderr.write(`blong-dev docs: ${STORYBOOK_MANIFEST} sites[${index}]: ${problem}\n`);
        process.exit(1);
    };
    if (typeof entry !== 'object' || entry === null) fail('not an object');
    const record = entry as Record<string, unknown>;
    const text = (key: string): string =>
        typeof record[key] === 'string' && record[key] !== ''
            ? (record[key] as string)
            : fail(`"${key}" is missing or not a non-empty string`);
    const name = text('name');
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        fail(`"name" must be a lowercase directory name, got "${name}"`);
    }
    return {
        name,
        title: text('title'),
        package: text('package'),
        command: text('command'),
        output: text('output'),
    };
}

/** Every markdown page under `dir`, in a stable order. */
function markdownUnder(dir: string): string[] {
    const found: string[] = [];
    const visit = (current: string): void => {
        for (const entry of readdirSync(current, {withFileTypes: true}).sort((a, b) =>
            a.name.localeCompare(b.name),
        )) {
            if (entry.name.startsWith('.')) continue;
            const path = join(current, entry.name);
            if (entry.isDirectory()) visit(path);
            else if (/\.mdx?$/.test(entry.name)) found.push(path);
        }
    };
    if (existsSync(dir)) visit(dir);
    return found;
}

/**
 * Every `<StorybookStory>` the docs and the blog contain.
 *
 * Quoted code is skipped: a page that documents the embed shows the tag in a fence, and an example
 * is not an embed — the same rule the `@@` reference scan follows. So the one page that has to
 * show the tag can do it without owing a story, and the check below only judges tags that render.
 */
export function findEmbeds(root: string): IStorybookEmbed[] {
    const embeds: IStorybookEmbed[] = [];
    for (const dir of ['docs/blong/docs', 'docs/blong/blog']) {
        for (const path of markdownUnder(join(root, dir))) {
            const markdown = stripCode(readFileSync(path, 'utf8'));
            for (const [tag] of markdown.matchAll(EMBED_TAG)) {
                const attributes = new Map<string, string>();
                for (const [, key, value] of tag.matchAll(ATTRIBUTE)) {
                    attributes.set(key.toLowerCase(), value);
                }
                embeds.push({
                    file: relative(root, path).split('\\').join('/'),
                    site: attributes.get('site') ?? '',
                    id: attributes.get('id') ?? '',
                });
            }
        }
    }
    return embeds;
}

/** The story ids a staged site serves, or `undefined` when it has not been staged. */
export function stagedStoryIds(root: string, site: IStorybookSite): Set<string> | undefined {
    const index = join(root, STORYBOOK_STATIC_ROOT, site.name, 'index.json');
    if (!existsSync(index)) return undefined;
    try {
        const parsed = JSON.parse(readFileSync(index, 'utf8')) as {
            entries?: Record<string, unknown>;
            stories?: Record<string, unknown>;
        };
        return new Set(Object.keys(parsed.entries ?? parsed.stories ?? {}));
    } catch {
        return undefined;
    }
}

/** Total size of a directory tree, in bytes. */
function treeSize(dir: string): number {
    let total = 0;
    // `encoding: 'utf8'`, not just `recursive`: without an encoding the entries come back as
    // buffers as well as strings, and `join` wants one or the other.
    for (const entry of readdirSync(dir, {recursive: true, encoding: 'utf8'})) {
        const path = join(dir, entry);
        if (statSync(path).isFile()) total += statSync(path).size;
    }
    return total;
}

export interface IStageOptions {
    /** Build each site before copying it. `--no-build` reuses the package's last build. */
    build: boolean;
    /** Say what would be staged and stop. */
    dryRun: boolean;
}

/** Build one site and copy it into the docs tree. Returns false when the build or copy failed. */
function stageSite(root: string, site: IStorybookSite, options: IStageOptions): boolean {
    const cwd = join(root, site.package);
    const output = join(cwd, site.output);
    const destination = join(root, STORYBOOK_STATIC_ROOT, site.name);

    if (options.dryRun) {
        process.stdout.write(
            `blong-dev docs: would ${options.build ? 'build and ' : ''}stage ${site.name} — ` +
                `${site.package}: ${site.command} → ${relative(root, destination)}\n`,
        );
        return true;
    }

    if (options.build) {
        process.stdout.write(`blong-dev docs: ${site.name} — ${site.command} in ${site.package}\n`);
        const result = spawnSync('sh', ['-c', site.command], {cwd, stdio: 'inherit'});
        if (result.error !== undefined) {
            process.stderr.write(
                `blong-dev docs: ${site.name}: cannot run in ${site.package} — ` +
                    `${result.error.message}\n`,
            );
            return false;
        }
        if (result.status !== 0) {
            process.stderr.write(
                `blong-dev docs: ${site.name}: build failed (exit ${result.status ?? 'signal'}) ` +
                    `in ${site.package}\n`,
            );
            return false;
        }
    }

    if (!existsSync(join(output, 'index.json'))) {
        process.stderr.write(
            `blong-dev docs: ${site.name}: ${site.package}/${site.output} has no index.json — ` +
                `${options.build ? 'the build wrote nothing' : 'build it first, or drop --no-build'}\n`,
        );
        return false;
    }

    // Replace rather than merge: a story removed from the package would otherwise survive in the
    // staged tree, and the embed check below would keep resolving an id nobody serves any more.
    rmSync(destination, {recursive: true, force: true});
    cpSync(output, destination, {recursive: true});
    const megabytes = (treeSize(destination) / 1024 / 1024).toFixed(1);
    process.stdout.write(
        `blong-dev docs: staged ${site.name} — ${relative(root, destination)} (${megabytes} MB)\n`,
    );
    return true;
}

/**
 * Stage the given sites, then check every embed against what was staged.
 *
 * Returns false when a build failed or an embed names a story no staged site serves; the caller
 * decides what a partial stage means (this one exits).
 *
 * The check always reads the whole register rather than `sites`: a run of `--only feedback`
 * cannot make an embed that names `site="sport"` wrong, and judging it against the subset made
 * every such page report an unknown site (a subset run could never pass). A site the register
 * names but nobody staged is reported as unstaged rather than as a bad id, which is what
 * `requireStaged: false` says.
 */
export function stageStorybooks(
    root: string,
    sites: IStorybookSite[],
    options: IStageOptions & {register?: IStorybookSite[]},
): boolean {
    let sound = true;
    for (const site of sites) {
        if (!stageSite(root, site, options)) sound = false;
    }
    if (options.dryRun) return sound;

    const register = options.register ?? sites;
    const problems = checkEmbeds(root, register, {requireStaged: register === sites});
    for (const problem of problems) process.stderr.write(`blong-dev docs: ${problem}\n`);
    return sound && problems.length === 0;
}

export interface ICheckEmbedsOptions {
    /**
     * Treat an unstaged site as a problem. True for a publish, where every site was just built;
     * false for a check that also runs on a machine with no Storybook staged, where an unstaged
     * site means the embeds cannot be judged rather than that they are wrong.
     */
    requireStaged: boolean;
}

/**
 * Every way an embed can fail to name a story: an unknown site, a missing attribute, or an id the
 * staged site does not serve.
 */
export function checkEmbeds(
    root: string,
    sites: IStorybookSite[],
    options: ICheckEmbedsOptions,
): string[] {
    const embeds = findEmbeds(root);
    if (embeds.length === 0) return [];
    const ids = new Map(sites.map(site => [site.name, stagedStoryIds(root, site)] as const));
    const known = [...ids.keys()].join(', ');
    const problems: string[] = [];
    for (const embed of embeds) {
        const where = `${embed.file}: <StorybookStory site="${embed.site}" id="${embed.id}">`;
        if (embed.site === '') {
            problems.push(`${where} — no site; the register holds ${known}`);
            continue;
        }
        if (!ids.has(embed.site)) {
            problems.push(`${where} — unknown site; the register holds ${known}`);
            continue;
        }
        if (embed.id === '') {
            problems.push(`${where} — no story id`);
            continue;
        }
        const staged = ids.get(embed.site);
        if (staged === undefined) {
            if (options.requireStaged) {
                problems.push(`${where} — site "${embed.site}" is not staged`);
            }
            continue;
        }
        if (!staged.has(embed.id)) {
            problems.push(`${where} — the staged "${embed.site}" site serves no such story`);
        }
    }
    return problems;
}
