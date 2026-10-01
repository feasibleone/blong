/**
 * Where the documentation pages and the agent skills live, and what to call them.
 *
 * The bank holds three streams: the memory entries, the documentation site, and the
 * agent skills. They are told apart by a tag rather than by a second bank, so one
 * `recall` can span them and the coverage check can reconcile each stream against
 * its own slice of the tree — a reconcile that considered "everything the bank
 * holds" would delete whatever another stream put there.
 *
 * The trees are walked from `rush.json`'s directory, never globbed, so an
 * ingestion run and a search agree on exactly which files exist.
 */

import {existsSync, readdirSync} from 'node:fs';
import {join, relative} from 'node:path';

import {MEMORY_TAG} from './hindsightDocument.ts';
import {DOCS_TAG, SKILL_TAG, type IPageSource} from './hindsightPage.ts';

/** The document streams an ingestion or a search can own. */
export type MemorySource = 'entry' | 'docs' | 'skill';

/** Every source, in the order a caller may name them. */
export const MEMORY_SOURCES: readonly MemorySource[] = ['entry', 'docs', 'skill'];

/** The tag that marks a document as belonging to a source. */
export const SOURCE_TAG: Record<MemorySource, string> = {
    entry: MEMORY_TAG,
    docs: DOCS_TAG,
    skill: SKILL_TAG,
};

/** Repository-relative root of the documentation site. */
export const DOCS_ROOT = 'docs/blong/docs';

/** Repository-relative root of the skills tree. */
export const SKILLS_ROOT = '.github/skills';

/**
 * Documentation tiers that hold pages, relative to the docs root.
 *
 * Named rather than walked: `docs/blong/docs` also holds `img/` and the blog, and a
 * page the build does not publish is not a knowledge page.
 */
export const DOC_TIERS: readonly string[] = ['concepts', 'patterns', 'rationale'];

/** The name a source is called in `--sources`, or `null` when it is not a source. */
export function sourceOf(value: string): MemorySource | null {
    return MEMORY_SOURCES.find(candidate => candidate === value.trim().toLowerCase()) ?? null;
}

/** Parse a `--sources`/`--source` value: a comma list of source names. */
export function parseSources(value: string): {sources: MemorySource[]; problems: string[]} {
    const sources: MemorySource[] = [];
    const problems: string[] = [];
    for (const part of value.split(',')) {
        const name = part.trim();
        if (name === '') continue;
        const source = sourceOf(name);
        if (!source) {
            problems.push(`unknown source "${name}" — use ${MEMORY_SOURCES.join(', ')}`);
            continue;
        }
        if (!sources.includes(source)) sources.push(source);
    }
    if (sources.length === 0 && problems.length === 0) {
        problems.push(`--sources needs one of ${MEMORY_SOURCES.join(', ')}`);
    }
    return {sources, problems};
}

/** The tags a reconcile considers its own, for the selected sources. */
export function sourceTags(sources: readonly MemorySource[]): string[] {
    return sources.map(source => SOURCE_TAG[source]);
}

/** The page files the selected sources hold, in a stable order. */
export function discoverPages(root: string, sources: readonly MemorySource[]): IPageSource[] {
    const found: IPageSource[] = [];
    if (sources.includes('docs')) found.push(...docPages(root));
    if (sources.includes('skill')) found.push(...skillPages(root));
    return found;
}

/** Build a source for a file a caller named, or `null` when it is not a page. */
export function pageSourceOf(root: string, file: string): IPageSource | null {
    const docsRoot = join(root, DOCS_ROOT);
    const docsRel = relative(docsRoot, file).split('\\').join('/');
    if (!docsRel.startsWith('..') && docsRel.endsWith('.md')) {
        const [tier] = docsRel.split('/');
        if (tier && DOC_TIERS.includes(tier)) {
            return {kind: 'docs', path: file, relativePath: docsRel, tier};
        }
        return null;
    }

    const skillsRoot = join(root, SKILLS_ROOT);
    const skillRel = relative(skillsRoot, file).split('\\').join('/');
    if (!skillRel.startsWith('..') && skillRel.endsWith('SKILL.md')) {
        return {kind: 'skill', path: file, relativePath: skillRel};
    }
    return null;
}

/** Every `.md` file directly inside a tier folder, in name order. */
function mdFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, {withFileTypes: true})
        .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => entry.name)
        .sort();
}

function docPages(root: string): IPageSource[] {
    const docsRoot = join(root, DOCS_ROOT);
    return DOC_TIERS.flatMap(tier =>
        mdFiles(join(docsRoot, tier)).map(name => ({
            kind: 'docs' as const,
            path: join(docsRoot, tier, name),
            relativePath: `${tier}/${name}`,
            tier,
        })),
    );
}

function skillPages(root: string): IPageSource[] {
    const skillsRoot = join(root, SKILLS_ROOT);
    if (!existsSync(skillsRoot)) return [];
    return readdirSync(skillsRoot, {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort()
        .map(name => join(skillsRoot, name, 'SKILL.md'))
        .filter(existsSync)
        .map(path => ({
            kind: 'skill' as const,
            path,
            relativePath: relative(skillsRoot, path).split('\\').join('/'),
        }));
}
