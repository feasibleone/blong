/**
 * Diagram capture helpers.
 *
 * A diagram is worth two artifacts for two different readers: a **screenshot**,
 * which proves the page drew it, and the **mermaid text**, which a human reviews
 * in a diff and a documentation site renders. Capturing only one of them is how a
 * diagram ends up either unreadable in review or unverified in the browser.
 *
 * The text is what the page was given — the caller already has it (from
 * `blong.flow.get`, or from a fixture) — so this module never scrapes the DOM for
 * it: a rendered SVG has no source text left in it, and the fallback `<pre>` is a
 * path that could mask a renderer that never ran.
 *
 * The artifact follows the pattern proven by `core/semantic-log`'s
 * `docs/observed-flows.md`: committed, rewritten only when
 * `BLONG_REGENERATE_DIAGRAMS=1` is set, and byte-compared otherwise. A test that
 * silently rewrote it would report a change nobody reviewed as a pass.
 */
import type {Expect, Locator} from '@playwright/test';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {BLONG_ELEMENT_TIMEOUT, type Portal} from '../playwright.js';

/** The element a diagram renderer leaves behind, whatever state it reached. */
export const DIAGRAM_SELECTOR =
    '[data-diagram-rendered], [data-diagram-pending], [data-diagram-fallback]';

/**
 * The drawn diagram the *user* is looking at.
 *
 * Not the first one in DOM order: a portal keeps every opened page mounted
 * (`renderActiveOnly={false}`), so an inactive page's diagram is still in the document
 * with a zero-height box — and clipping that is `options.clip.height not to be 0`,
 * which reads as a screenshot bug rather than as "the wrong page was measured". The
 * screenshot and the source text have to be taken from *one* element, or the artifact
 * describes a diagram other than the one in the picture.
 */
const VISIBLE_DIAGRAM = '[data-diagram-rendered]:visible';

/** The diagram text of the visible drawn diagram. */
const VISIBLE_DIAGRAM_TEXT = '[data-diagram-text]:visible';

/** True when the artifact should be rewritten rather than compared. */
export function shouldRegenerateDiagrams(): boolean {
    return process.env['BLONG_REGENERATE_DIAGRAMS'] === '1';
}

/**
 * Whether a diagram drew a call at all, in either style.
 *
 * This is the condition a capture is written under, and it has to accept **both**
 * arrows: `->>` when the receiver answered and `--x` when nothing did. Accepting only
 * the crossed one is a capture that silently stops writing the moment the framework
 * starts recording calls — which is exactly what it did, and the skips read as "this
 * deployment declares nothing", which was true only before the fix (T-118).
 *
 * A crossed arrow is content rather than a failure: "the caller declared a call and
 * nothing answered" is a deployment fact, and a diagram drawn from deductions could
 * not show it. What is *not* an artifact is a participant list with no arrow at all —
 * that records a flow nobody called (D-209).
 */
export function drawsACall(diagram: string): boolean {
    return /->>|--x/.test(diagram);
}

/**
 * The markdown body for a set of diagrams — one fenced mermaid block each.
 *
 * Pure, and exported, so the artifact format is testable without a browser: the
 * page capture is the part that needs one, not the file.
 */
export function diagramArtifactContent(diagrams: readonly string[]): string {
    return (
        `# Sequence Diagrams\n\n` +
        diagrams.map(diagram => `\`\`\`mermaid\n${diagram.trimEnd()}\n\`\`\``).join('\n\n') +
        '\n'
    );
}

export interface ICaptureDiagramOptions {
    /** Baseline name for the screenshot, without the platform suffix Playwright adds. */
    name: string;
    /**
     * The diagram text, when the caller already has it. Left out, it is read from
     * the rendered diagram's `data-diagram-text` — the page was given the text, so
     * there is no reason for a spec to fetch it a second way.
     */
    diagram?: string;
    /**
     * Markdown file the text is written into (and compared against), relative to
     * the working directory of the package running the spec — e.g.
     * `docs/observedFlows.md`.
     */
    artifact?: string;
    /** Where the rendered diagram is; defaults to {@link DIAGRAM_SELECTOR}. */
    selector?: string;
    /**
     * How long to wait for the diagram to appear. Defaults to 30s: mermaid is
     * loaded lazily, and a cold chunk on a first run is more than the suite's
     * deliberately short element budget covers.
     */
    timeout?: number;
}

/** The height (px) a window is grown to before the capture stops trying to frame one. */
const MAX_DIAGRAM_FRAME = 2_000;

/** How many pixels the element's box spends outside a frame that can show it. */
async function pixelsOutsideTheFrame(target: Locator): Promise<number> {
    return target.evaluate(node => {
        const child = node.getBoundingClientRect();
        // Below the window, and below the nearest box that clips its scrolling — the
        // diagram's box is given the height the executions list leaves, so a long enough
        // list makes it shorter than the drawing.
        let outside = child.bottom - window.innerHeight;
        for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
            const {overflowY} = getComputedStyle(parent);
            if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
            outside = Math.max(outside, child.bottom - parent.getBoundingClientRect().bottom);
            break;
        }
        return Math.max(0, Math.ceil(outside));
    });
}

/**
 * Give the drawing a frame in which it is wholly on screen.
 *
 * Both halves of an element screenshot go wrong when part of the element is outside the
 * box that shows it. The rows that are left are whatever is painted behind that box, so
 * the artifact ends in the page's own colours and how many rows there are depends on how
 * many executions the run happened to record — a picture that changes with the run
 * rather than with the code (F-221, F-226). And a screenshot clip is clamped to the
 * viewport: measured, a clip 6px past the bottom came back 6px shorter.
 *
 * The panel grows with the window and the executions list may take at most half of it,
 * so a taller window always leaves the diagram more room — the loop is there because how
 * much more is the page's arithmetic, not this helper's. Not growing past
 * `MAX_DIAGRAM_FRAME` is the guard against a diagram that can never fit: the capture
 * then fails saying so, instead of committing a picture of the page behind the panel.
 */
async function frameTheWholeDiagram(portal: Portal, target: Locator): Promise<void> {
    const viewport = portal.page.viewportSize() ?? {width: 1600, height: 900};
    let height = viewport.height;
    for (;;) {
        await target.scrollIntoViewIfNeeded();
        const outside = await pixelsOutsideTheFrame(target);
        if (outside === 0) return;
        // More than the missing rows, because the room comes back a fraction of the
        // growth at a time: an execution row has to be paid for out of the panel too.
        const grown = Math.min(height + outside + 40, MAX_DIAGRAM_FRAME);
        if (grown === height) break;
        height = grown;
        await portal.page.setViewportSize({width: viewport.width, height});
    }
    throw new Error(
        `the diagram does not fit the box that shows it, even in a ${viewport.width}x${height} ` +
            'window, so a capture of it would end in whatever is painted behind that box. ' +
            'The drawing cannot be photographed whole here.',
    );
}

/**
 * Capture a diagram the page is showing: wait for it, screenshot it, and write
 * its text to the markdown artifact.
 *
 * Fails with the page's own text if no diagram element appears at all, because
 * "nothing rendered" is a different defect from "rendered the wrong thing", and
 * a bare locator timeout says neither.
 */
export async function captureDiagram(
    portal: Portal,
    expect: Expect,
    {
        name,
        diagram,
        artifact,
        selector = DIAGRAM_SELECTOR,
        timeout = 30_000,
    }: ICaptureDiagramOptions,
): Promise<void> {
    const viewer = portal.page.locator(selector);
    try {
        await viewer.first().waitFor({state: 'attached', timeout: Math.max(timeout, 1_000)});
    } catch {
        throw new Error(
            `no diagram element (${selector}) appeared within ${timeout}ms.\n` +
                `page text:\n${await portal.page.locator('body').innerText()}\n` +
                `browser errors:\n${portal.browserErrors.join('\n')}`,
        );
    }
    // Attached is not drawn. The selector matches the pending and fallback states
    // too, so waiting for "an element exists" screenshots a zero-height placeholder
    // and calls it a diagram — the clip is then 0px tall, which Playwright reports
    // as a bare `options.clip.height not to be 0`. Wait for the drawn state before
    // capturing, so what is compared is what was rendered.
    await expectDiagramDrawn(portal, expect, {timeout});
    const source = diagram ?? (await diagramText(portal));
    if (artifact !== undefined && source.trim().length === 0) {
        throw new Error(
            `the diagram rendered without its source text, so ${artifact} would record nothing. ` +
                'A renderer that cannot say what it drew is a renderer a review cannot check.',
        );
    }
    // The element, not the page: a diagram capture that included the rest of the
    // portal would fail for reasons that have nothing to do with drawing.
    //
    // And the *drawn*, *visible* element, not the first match of the selector: that
    // selector includes the pending and fallback states on purpose, and a portal that
    // keeps every opened page mounted holds an inactive page's diagram too.
    const target = portal.page.locator(VISIBLE_DIAGRAM).first();
    await frameTheWholeDiagram(portal, target);
    const box = await target.boundingBox();
    if (box === null) {
        throw new Error(`the drawn diagram (${VISIBLE_DIAGRAM}) has no box to capture.`);
    }
    // The clip is computed here, and rounded, rather than left to a locator screenshot —
    // which snaps the element's box *outward* to whole pixels. Measured: an element 100px
    // tall at y=50.5 is photographed as 101 rows whose first row is the page behind it;
    // rounded, the same element photographs as its own 100 rows starting on its own first
    // pixel. The size a run compares is then the element's size, not the element's
    // position on the pixel grid, which is what made this capture 355px in one run and
    // 356px in the next with nothing about the drawing changed (F-226).
    //
    // Viewport-relative, which is what `boundingBox()` and a screenshot `clip` both use:
    // measured on a page scrolled by 200px, a clip at the element's *viewport* coordinates
    // framed the element while the same clip at its document coordinates did not.
    await expect(portal.page).toHaveScreenshot(`${name}.png`, {
        clip: {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
        },
        // A diagram is a taller, heavier capture than an element assertion, and the
        // default five-second expect timeout is spent before a first (uncached)
        // render is photographed — reported as a bare screenshot timeout, which
        // reads as "the page never stabilised" rather than "the budget was too
        // small". Animations off for the same reason: mermaid animates in.
        timeout: Math.max(timeout, BLONG_ELEMENT_TIMEOUT),
        animations: 'disabled',
    });

    if (artifact === undefined) return;
    const content = diagramArtifactContent([source]);
    const path = artifact;
    const previous = ((): string | undefined => {
        try {
            return readFileSync(path, 'utf8');
        } catch {
            return undefined;
        }
    })();
    if (shouldRegenerateDiagrams() || previous === undefined) {
        mkdirSync(dirname(path), {recursive: true});
        writeFileSync(path, content);
        return;
    }
    // Compared, not rewritten: a diagram that changed is a change someone has to
    // look at, and a suite that rewrites it reports that as a pass.
    expect(
        previous,
        `${path} does not match the diagram this run produced. ` +
            'Rerun with BLONG_REGENERATE_DIAGRAMS=1 if the change is intended, and review the diff.',
    ).toBe(content);
}

/**
 * The mermaid text the visible drawn diagram was given, or an empty string.
 *
 * Exported because a spec decides whether there is anything to capture *before* it
 * captures: it has to ask the same question the capture will answer, about the same
 * element, or the policy and the artifact can disagree about which diagram is meant.
 */
export async function diagramText(portal: Portal): Promise<string> {
    return (
        (await portal.page
            .locator(VISIBLE_DIAGRAM_TEXT)
            .first()
            .getAttribute('data-diagram-text')) ?? ''
    );
}

/** Wait for a diagram element to reach a drawn state, or a fallback if it refused. */
export async function expectDiagramDrawn(
    portal: Portal,
    expect: Expect,
    {timeout = 30_000}: {timeout?: number} = {},
): Promise<void> {
    await expect(portal.page.locator(VISIBLE_DIAGRAM)).toBeVisible({
        timeout: Math.max(timeout, BLONG_ELEMENT_TIMEOUT),
    });
}
