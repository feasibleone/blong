/**
 * Which documentation pages carry something that has to be seen to be believed, and how much.
 *
 * `blong-dev docs verify` needs this because the two visual artefacts in the docs site fail in ways
 * nothing else catches:
 *
 * - **A mermaid block is only parsed in a browser.** The parser measures text with `getBBox`, which
 *   jsdom does not implement, so the diagram renderer's own tests mock mermaid rather than exercise
 *   it (`core/blong-browser/src/viewers/diagram/MermaidRenderer.test.tsx`, F-212). A syntax error
 *   therefore builds, serves and passes every test, and the reader sees an error box.
 * - **An image reference is not checked by anything either.** `onBrokenLinks: 'throw'` guards
 *   internal links, not pictures: a page can point at a file that was never committed and build
 *   clean, with the reader getting a broken-image icon.
 * - **An embedded story renders nothing when the page's own markdown is broken.**
 *   `<StorybookStory>` is a markdown page's one piece of JSX, so a tag the MDX parser drops — an
 *   unescaped `<` in the prose around it, a tag split across two lines — takes the story with it
 *   and leaves the page reading as if it never had one. Counting the embeds the markdown declares
 *   against the elements that rendered is what catches it. The story itself is not loaded here:
 *   the published Storybook is a build output that a plain docs build does not stage, so the
 *   check is about the embed, and `blong-dev docs storybook` is the one that resolves the ids.
 *
 * That leaves a browser visit as the only check, and a visit needs to know what to expect: how many
 * diagrams a page owes, and whether it has pictures at all. A page that failed to parse a block
 * renders nothing, so comparing what drew against what the markdown declares is what turns "the page
 * loaded" into "no diagram was silently dropped".
 */

import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

/** One page with visuals, and what the verification run has to find on it. */
export interface IVisualPage {
    /** Path relative to the tree that was scanned, e.g. `concepts/rbac.md`. */
    file: string;
    /** Site route below the base path, e.g. `docs/concepts/rbac`, `blog/one-adapter-api`. */
    route: string;
    /** How many mermaid blocks the page contains. */
    blocks: number;
    /** How many images the page embeds. */
    images: number;
    /** How many stories the page embeds with `<StorybookStory>`. */
    stories: number;
}

/** A fenced block that opens with the mermaid info string. */
const MERMAID_FENCE = /^```mermaid\s*$/gm;

/** A markdown image reference. */
const IMAGE = /!\[[^\]]*\]\([^)\s]+/g;

/** A line that opens or closes a fenced block of any language. */
const FENCE = /^\s*(?:```|~~~)/;

/** How many mermaid blocks `markdown` contains. */
export function countMermaidBlocks(markdown: string): number {
    return markdown.match(MERMAID_FENCE)?.length ?? 0;
}

/**
 * How many images `markdown` embeds.
 *
 * Deliberately a plain count of markdown image syntax, with no attempt to skip fenced code: this
 * number only decides *whether a page is worth visiting*, and over-counting costs one page load
 * while under-counting silently drops a page from the check.
 */
export function countImages(markdown: string): number {
    return markdown.match(IMAGE)?.length ?? 0;
}

/** The tag a page embeds a story with. */
const STORYBOOK_EMBED = /<StorybookStory\b/g;

/**
 * `markdown` with every fenced block and inline code span emptied out.
 *
 * A page about a feature may quote one — the Storybook pattern doc shows the embed tag it
 * describes — and a quoted example is an illustration, not an embed. This is the same rule the
 * `@@` reference scan follows: inside backticks, a token is being shown rather than used.
 *
 * Fenced blocks are replaced line for line, so the result can be read position by position; inline
 * spans are dropped from what is left.
 */
export function stripCode(markdown: string): string {
    const lines: string[] = [];
    let inFence = false;
    for (const line of markdown.split('\n')) {
        if (FENCE.test(line)) {
            inFence = !inFence;
            lines.push('');
            continue;
        }
        lines.push(inFence ? '' : line);
    }
    return lines.join('\n').replace(/`[^`\n]*`/g, '');
}

/**
 * How many stories `markdown` embeds.
 *
 * Counted outside code, so the tag a how-to quotes does not make the page owe a story — and the
 * same reading is what the embed check uses to decide which tags have to resolve to a real story id
 * (`tools/blong-dev/src/docs/storybookSites.ts`).
 */
export function countStorybookEmbeds(markdown: string): number {
    return stripCode(markdown).match(STORYBOOK_EMBED)?.length ?? 0;
}

/**
 * The docs route for a markdown file, relative to the docs directory.
 *
 * Docusaurus maps a file to its path with the extension dropped, and treats `index.md` as the
 * directory itself; `trailingSlash` is false in `docusaurus.config.json`, so no trailing slash.
 */
export function routeForDocsFile(file: string): string {
    const withoutExtension = file.replace(/\.md$/, '').split('\\').join('/');
    if (withoutExtension === 'index') return '';
    if (withoutExtension.endsWith('/index')) return withoutExtension.slice(0, -'/index'.length);
    return withoutExtension;
}

/** Walk `dir` for markdown, in a stable order, ignoring directories that start with a dot. */
function walk(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, {withFileTypes: true}).sort((a, b) =>
        a.name.localeCompare(b.name),
    )) {
        if (entry.name.startsWith('.')) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...walk(path));
        else if (entry.name.endsWith('.md')) found.push(path);
    }
    return found;
}

/**
 * The blog route of a post: its `slug` front matter, or the folder name with the
 * date prefix dropped, which is what Docusaurus falls back to.
 */
export function blogSlug(file: string, markdown: string): string {
    const slug = /^slug:\s*(\S+)\s*$/m.exec(markdown)?.[1];
    if (slug !== undefined) return slug;
    return file.split('/')[0].replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

/** Every page under `dir` that has a diagram or an image, routed by `routeFor`. */
function pagesUnder(
    dir: string,
    routeFor: (file: string, markdown: string) => string,
): IVisualPage[] {
    const pages: IVisualPage[] = [];
    for (const path of walk(dir)) {
        const markdown = readFileSync(path, 'utf8');
        const blocks = countMermaidBlocks(markdown);
        const images = countImages(markdown);
        const stories = countStorybookEmbeds(markdown);
        if (blocks === 0 && images === 0 && stories === 0) continue;
        const file = relative(dir, path).split('\\').join('/');
        pages.push({file, route: routeFor(file, markdown), blocks, images, stories});
    }
    return pages;
}

/**
 * Every docs page under `docsDir` that has a diagram or an image.
 *
 * Pages with neither are left out rather than reported as passing, so the run visits only what it
 * can assert something about.
 */
export function findVisualPages(docsDir: string, prefix = 'docs'): IVisualPage[] {
    return pagesUnder(docsDir, file => {
        const route = routeForDocsFile(file);
        return (route === '' ? prefix : `${prefix}/${route}`).replace(/\/$/, '');
    });
}

/**
 * Every blog post under `blogDir` that has a diagram or an image.
 *
 * A post's route comes from its front matter rather than from its folder, which
 * is why it is not an argument to `findVisualPages`.
 */
export function findBlogPages(blogDir: string): IVisualPage[] {
    return pagesUnder(blogDir, (file, markdown) => `blog/${blogSlug(file, markdown)}`);
}
