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
    /** Documentation-relative markdown path, e.g. `concepts/rbac.md`. */
    file: string;
    /** Route below the site's docs prefix, e.g. `concepts/rbac`. */
    route: string;
    /** How many mermaid blocks the page contains. */
    blocks: number;
    /** How many images the page embeds. */
    images: number;
}

/** A fenced block that opens with the mermaid info string. */
const MERMAID_FENCE = /^```mermaid\s*$/gm;

/** A markdown image reference. */
const IMAGE = /!\[[^\]]*\]\([^)\s]+/g;

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
 * Every page under `docsDir` that has a diagram or an image.
 *
 * Pages with neither are left out rather than reported as passing, so the run visits only what it
 * can assert something about.
 */
export function findVisualPages(docsDir: string): IVisualPage[] {
    const pages: IVisualPage[] = [];
    for (const path of walk(docsDir)) {
        const markdown = readFileSync(path, 'utf8');
        const blocks = countMermaidBlocks(markdown);
        const images = countImages(markdown);
        if (blocks === 0 && images === 0) continue;
        const file = relative(docsDir, path).split('\\').join('/');
        pages.push({file, route: routeForDocsFile(file), blocks, images});
    }
    return pages;
}
