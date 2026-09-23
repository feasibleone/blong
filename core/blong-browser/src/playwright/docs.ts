/**
 * Documentation screenshot helpers.
 *
 * A screenshot in a doc page has two jobs the regression baselines do not: it must be
 * *composed* (one toolbar state, one dialogue, one row — not whatever the page happened
 * to look like) and it must be *stable enough to review*, because what a reader sees is
 * a picture nobody can re-derive from the source. The committed `*.play.ts-snapshots/`
 * baselines are the wrong source for that: they are deliberately whole-page, they carry
 * the run's own data, and they are regenerated in CI because font rendering differs
 * between a developer's machine and a runner.
 *
 * So a docs capture is a different act from a baseline comparison:
 *
 * - It writes a **PNG into the docs tree**, not into a snapshot directory, so the picture
 *   is committed next to the page that shows it and a reader of the diff sees the change.
 * - It writes **only when `BLONG_CAPTURE_DOCS=1`**, so the spec runs in CI as an ordinary
 *   smoke test — it still waits for the page and fails on a browser error — without
 *   overwriting the committed images on every run. A test that rewrote its own artifact
 *   would report a changed picture as a pass.
 * - It is **clipped and masked** rather than whole-page: `region` photographs the element
 *   the doc is about, and `mask` paints over what varies between runs.
 *
 * Because PNG bytes depend on font rendering, a docs image is *not* byte-compared by
 * `blong-dev docs check` — it verifies the image exists and is non-empty, and the content
 * is reviewed the way any other committed picture is. That is the same trade the
 * repository already makes for baselines, which are generated in CI and never
 * auto-committed.
 *
 * A capture that cannot be made stable is worse than no capture, so determinism is the
 * caller's obligation, and the tools are the ones the baselines already use: pin the rows
 * with a search term, mask the minted ids and clocks, and clip to one element.
 */
import type {Locator, Page} from '@playwright/test';
import {existsSync, mkdirSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

import {BLONG_ELEMENT_TIMEOUT} from '../playwright.js';

/** How an element is named: a ready-made locator, or a selector to build one from. */
export type ElementRef = Locator | string;

/** Where the docs site keeps images, relative to the repository root. */
export const DOCS_IMAGE_ROOT = 'docs/blong/docs';

/** Walk up from `start` until a directory holding `rush.json` is found. */
function repoRoot(start: string): string {
    let dir = resolve(start);
    for (;;) {
        if (existsSync(join(dir, 'rush.json'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) return resolve(start);
        dir = parent;
    }
}

/** True when this run should write the committed images rather than only check the pages. */
export function shouldCaptureDocs(): boolean {
    return process.env['BLONG_CAPTURE_DOCS'] === '1';
}

/**
 * Absolute path of a docs image.
 *
 * `name` is relative to the docs tree and says where the picture belongs, e.g.
 * `concepts/img/editor-toolbar-read.png` — the tier's own `img/` folder, so the page that
 * shows the image and the image sit in the same directory tree and a relative
 * `![](./img/…)` reference resolves in the source viewer as well as in the built site.
 */
export function docsImagePath(name: string): string {
    return join(repoRoot(process.cwd()), DOCS_IMAGE_ROOT, name);
}

/** Resolve an {@link ElementRef} against a page. */
function locatorOf(page: Page, ref: ElementRef): Locator {
    return typeof ref === 'string' ? page.locator(ref) : ref;
}

export interface ICaptureDocsOptions {
    /**
     * Image name relative to the docs tree, including the tier's `img/` folder, e.g.
     * `concepts/img/editor-toolbar-read.png`.
     */
    name: string;
    /** What to photograph. Left out, the whole viewport is captured. */
    region?: ElementRef;
    /**
     * What to paint over before capturing — volatile content such as minted ids, session
     * tokens and clocks. A picture whose only difference between two runs is a timestamp
     * is a picture no reviewer can tell apart from a real change.
     *
     * Readonly because a caller passes the same list it gave the baseline: `openPages`
     * forwards its page's `mask` here unchanged, and a mutable parameter would force it to
     * copy a list this function never writes to.
     */
    mask?: readonly ElementRef[];
    /** Photograph the scrollable page rather than the viewport. Defaults to false. */
    fullPage?: boolean;
    /** How long to wait for the region to appear. Defaults to the suite's element budget. */
    timeout?: number;
}

/**
 * Capture one page state for the documentation.
 *
 * Always *waits* for the region, so the spec is a real smoke test on machines that are not
 * writing images. The PNG is written only under {@link shouldCaptureDocs}.
 *
 * Written with `page.screenshot({path})` rather than `toHaveScreenshot`, because the picture
 * belongs in the docs tree under the name the page references — an arbitrary path, not the
 * `*-snapshots/` directory Playwright owns — and because a docs image is reviewed rather than
 * compared. The waiting is therefore explicit: the region has to be visible, and one animation
 * frame has to have been spent, or a widget that fades in is photographed mid-fade.
 */
export async function captureDocs(
    portal: {page: Page; browserErrors: string[]},
    {name, region, mask, fullPage = false, timeout = BLONG_ELEMENT_TIMEOUT}: ICaptureDocsOptions,
): Promise<void> {
    let clip: {x: number; y: number; width: number; height: number} | undefined;
    if (region !== undefined) {
        const target = locatorOf(portal.page, region).first();
        try {
            await target.waitFor({state: 'visible', timeout: Math.max(timeout, 1_000)});
        } catch {
            throw new Error(
                `the region for the docs image "${name}" did not become visible within ` +
                    `${timeout}ms.\npage text:\n${await portal.page.locator('body').innerText()}\n` +
                    `browser errors:\n${portal.browserErrors.join('\n')}`,
            );
        }
        await target.scrollIntoViewIfNeeded();
        const box = await target.boundingBox();
        if (box === null) {
            throw new Error(`the region for the docs image "${name}" has no box to capture.`);
        }
        // Rounded here rather than left to a locator screenshot, which snaps the box
        // *outward* to whole pixels and photographs a row of whatever is behind the
        // element. The same reason `captureDiagram` computes its own clip (F-226).
        clip = {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
        };
    }

    if (!shouldCaptureDocs()) return;

    const path = docsImagePath(name);
    mkdirSync(dirname(path), {recursive: true});
    await portal.page.screenshot({
        path,
        clip,
        mask: (mask ?? []).map(ref => locatorOf(portal.page, ref).first()),
        // `clip` and `fullPage` are mutually exclusive: a clip is already a frame.
        fullPage: region === undefined && fullPage,
        animations: 'disabled',
        timeout: Math.max(timeout, BLONG_ELEMENT_TIMEOUT),
    });
}

/**
 * Fail when a committed docs image is missing or empty.
 *
 * The counterpart of {@link captureDocs} on a run that is not capturing: it cannot compare
 * bytes (font rendering differs between machines), but a page that references an image
 * nobody ever committed, or a capture that wrote a zero-byte file, is a broken page and
 * not a rendering difference. `blong-dev docs check` calls this through the manifest.
 */
export function expectDocsImagePresent(name: string): void {
    const path = docsImagePath(name);
    if (!existsSync(path)) {
        throw new Error(
            `the docs image "${name}" has not been captured. ` +
                'Run the owning spec with BLONG_CAPTURE_DOCS=1 to create it.',
        );
    }
    if (statSync(path).size === 0) {
        throw new Error(
            `the docs image "${name}" is empty, so the page showing it has no picture.`,
        );
    }
}
