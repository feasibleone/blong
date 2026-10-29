/**
 * Feedback mode — the flow a person and a reviewer actually walk (`@@T-478`).
 *
 * One spec, four captures: the mode on with the pointer over a field, the crop
 * region, the two comments in their callouts with the line back to each element,
 * and the review page's detail pane holding the picture with the boxes where they
 * were left. In between it drags a callout, resizes it, crops the picture,
 * submits, opens the review page from its own menu entry, renders the document and
 * marks the session processed — the whole contract, not a screenshot of a
 * component (`@@T-487`–`@@T-491`).
 *
 * Two things are done for the captures' sake. The queue is emptied first by
 * marking every open session processed, so the review page shows this run's
 * session and not whatever earlier runs left behind; and the capture is taken of
 * the detail pane rather than the whole page, because the queue's timestamps are
 * the one part of that page no run can reproduce.
 *
 * The screen capture is stubbed in the page: `getDisplayMedia` needs a picker and
 * a secure context, and headless Chromium has neither. The stub hands the capture
 * code a canvas stream painted from a picture the test took of the page itself —
 * so what the reviewer opens is the page the person was looking at rather than a
 * painted rectangle, while drawing, cropping, scaling and encoding stay under
 * test (`@@D-658`).
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {snapshotName} from './sportPlay.js';

test.use({blongPermissions: true});

/** Replace the picker with a canvas painted from `window.__feedbackShot`. */
async function stubCapture(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(() => {
        const media = navigator.mediaDevices as MediaDevices;
        Object.defineProperty(media, 'getDisplayMedia', {
            configurable: true,
            value: async () => {
                const seeded = (window as unknown as {__feedbackShot?: string}).__feedbackShot;
                const image = new Image();
                if (seeded) {
                    image.src = `data:image/png;base64,${seeded}`;
                    await image.decode().catch(() => undefined);
                }
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth || 1280;
                canvas.height = image.naturalHeight || 800;
                const context = canvas.getContext('2d');
                if (context) {
                    if (seeded && image.naturalWidth) {
                        context.drawImage(image, 0, 0);
                    } else {
                        context.fillStyle = '#f4f4f5';
                        context.fillRect(0, 0, canvas.width, canvas.height);
                    }
                }
                return canvas.captureStream(2);
            },
        });
    });
}

/**
 * Take the picture the stub will hand to the capture code.
 *
 * It is taken before the mode is switched on: a screen capture of the real page
 * would include the chrome as it stood at that moment, and the rows already carry
 * the boxes, which the review page draws from the stored fractions. So the test
 * keeps the clean page and lets the product draw over it.
 */
async function seedShot(page: import('@playwright/test').Page): Promise<void> {
    const png = (await page.screenshot({type: 'png'})).toString('base64');
    await page.evaluate(shot => {
        (window as unknown as {__feedbackShot?: string}).__feedbackShot = shot;
    }, png);
}

/** The two things the spec comments on: a field of the detail card, a column header. */
const COMMENTS = [
    {
        target: '[data-feedback-kind="field"]',
        text: 'The label does not say which club this filter is for.',
    },
    {
        target: '[data-feedback-kind="column"]',
        text: 'The header wraps and cuts the text.',
    },
];

/**
 * Take every open session out of the reviewer's queue.
 *
 * The review page lists the `new` queue newest first, and a dev database keeps
 * what earlier runs submitted, so without this the page opens on somebody else's
 * session and the capture carries their timestamps. Marking them processed is the
 * reviewer's own act, not a test-only back door.
 */
async function clearQueue(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(async () => {
        const handler = (
            window as unknown as {
                __blongHandler?: Record<string, (p: object, m: object) => Promise<unknown>>;
            }
        ).__blongHandler;
        if (!handler) return;
        const listed = (await handler['feedback.session.list']?.(
            {status: null, limit: 500},
            {},
        )) as {sessions?: Array<{sessionId: string}>} | undefined;
        const sessionIds = (listed?.sessions ?? []).map(row => row.sessionId);
        if (sessionIds.length) {
            await handler['feedback.session.update']?.({sessionIds}, {});
        }
    });
}

/** Drag a point by (dx, dy) with real pointer events, so the handlers run. */
async function dragBy(
    page: import('@playwright/test').Page,
    selector: string,
    dx: number,
    dy: number,
): Promise<void> {
    const handle = page.locator(selector).first();
    const box = await handle.boundingBox();
    if (!box) throw new Error(`${selector} has no box to drag`);
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dx / 2, startY + dy / 2, {steps: 4});
    await page.mouse.move(startX + dx, startY + dy, {steps: 4});
    await page.mouse.up();
}

test('feedback mode captures comments and the review page hands them over', async ({portal}) => {
    await stubCapture(portal.page);

    // A page with both kinds of target on it: the detail card's field and a
    // table's column header.
    await portal.menuClick('sport.club.browse');
    await portal.waitForTableData();

    // The picture the capture stub will use: this page, before the mode is on.
    await seedShot(portal.page);

    // Start from an empty queue, so the review page opens on this run's session.
    await clearQueue(portal.page);

    // The switch is in the menubar, and only where a suite enabled it.
    const toggle = portal.page.locator('[data-feedback-ui="toggle"]');
    await expect(toggle).toBeVisible();
    await toggle.click();

    // A target paints on hover. Its badge is the tail of the identifier and the
    // tooltip is the whole path, which is what a reader acts on (`@@T-491`).
    const first = portal.page.locator(COMMENTS[0].target).first();
    await first.hover();
    const hovering = portal.page.locator('.blong-feedback-ring--hover');
    await expect(hovering).toBeVisible();
    const badge = hovering.locator('.blong-feedback-ring__badge');
    await expect(badge).toBeVisible();
    const fullId = await badge.getAttribute('title');
    expect(fullId).toMatch(/^sport\.club\.browse\//);
    const tail = (await badge.textContent())?.trim();
    expect(tail).toBeTruthy();
    expect(tail).not.toBe(fullId);
    await expect(portal.page).toHaveScreenshot(snapshotName('feedback-hover-1.png'));

    // One click per target: the box opens where the solver put it.
    for (const [index, comment] of COMMENTS.entries()) {
        const target = portal.page.locator(comment.target).first();
        await target.click();
        const textarea = portal.page.locator('[data-feedback-ui="callout"] textarea').nth(index);
        await textarea.fill(comment.text);
    }

    // A box, and a line from it to the element it is about (`@@T-489`).
    const callouts = portal.page.locator('[data-feedback-ui="callout"]');
    await expect(callouts).toHaveCount(2);
    await expect(portal.page.locator('.blong-feedback-connector')).toHaveCount(2);
    await expect(callouts.nth(0).locator('textarea')).toHaveValue(/does not say which club/);
    await expect(callouts.nth(1).locator('textarea')).toHaveValue(/header wraps/);

    const boxes = await callouts.evaluateAll(elements =>
        elements.map(element => element.getBoundingClientRect().toJSON()),
    );
    const overlap = boxes.some((a, i) =>
        boxes.some(
            (b, j) =>
                i !== j &&
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0,
        ),
    );
    expect(overlap).toBe(false);
    await expect(portal.page).toHaveScreenshot(snapshotName('feedback-callouts-1.png'));

    // The box belongs to the person: the bevel moves it, the corner resizes it.
    const before = boxes[1];
    const second = callouts.nth(1);
    const bevel = second.locator('.blong-feedback-callout__bevel');
    const bevelBox = await bevel.boundingBox();
    if (!bevelBox) throw new Error('no bevel to drag');
    await portal.page.mouse.move(bevelBox.x + bevelBox.width / 2, bevelBox.y + bevelBox.height / 2);
    await portal.page.mouse.down();
    await portal.page.mouse.move(
        bevelBox.x + bevelBox.width / 2 + 70,
        bevelBox.y + bevelBox.height / 2 + 40,
        {steps: 6},
    );
    await portal.page.mouse.up();

    const moved = await second.boundingBox();
    expect(moved?.x).toBeGreaterThan(before.x + 20);
    expect(moved?.y).toBeGreaterThan(before.y + 10);

    const widthBefore = moved?.width ?? 0;
    const corner = second.locator('.blong-feedback-callout__resize');
    const cornerBox = await corner.boundingBox();
    if (!cornerBox) throw new Error('no corner to drag');
    await portal.page.mouse.move(
        cornerBox.x + cornerBox.width / 2,
        cornerBox.y + cornerBox.height / 2,
    );
    await portal.page.mouse.down();
    await portal.page.mouse.move(
        cornerBox.x + cornerBox.width / 2 + 60,
        cornerBox.y + cornerBox.height / 2 + 40,
        {steps: 6},
    );
    await portal.page.mouse.up();

    const resized = await second.boundingBox();
    expect(resized?.width).toBeGreaterThan(widthBefore + 20);

    // Crop to the part the reviewer needs; the anchors follow the crop (`@@T-490`).
    const bar = portal.page.locator('[data-feedback-ui="bar"]');
    await bar.getByRole('button', {name: /Crop/}).click();
    await expect(portal.page.locator('[data-feedback-ui="crop"]')).toBeVisible();
    await expect(portal.page).toHaveScreenshot(snapshotName('feedback-crop-1.png'));
    await dragBy(portal.page, '.blong-feedback-crop__handle', -60, -40);
    await bar.getByRole('button', {name: /Done/}).click();
    await expect(portal.page.locator('[data-feedback-ui="crop"]')).toHaveCount(0);

    // Submitting leaves the mode and stores the batch.
    await bar.getByRole('button', {name: 'Submit'}).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // The confirmation toast sits over the detail pane and lives for a few
    // seconds, so the capture waits it out rather than photographing it.
    await expect(portal.page.locator('.p-toast-message')).toHaveCount(0, {timeout: 20_000});

    // The review page, reached from the realm's own menu entry. The group opens on
    // click, and its item is only clickable once it has.
    await portal.page.getByTestId('portal-menu-feedback').click();
    await portal.page.getByTestId('portal-menu-feedback-review').click();
    const queue = portal.page.locator('[data-feedback-queue-row]');
    await expect(queue.first()).toBeVisible();
    // The queue is newest first and other runs left sessions in it, so the spec
    // remembers the row it is about rather than counting the rows around it.
    const sessionId = await queue.first().getAttribute('data-feedback-queue-row');

    await queue.first().click();
    await expect(portal.page.locator('img[alt="Captured screen"]')).toBeVisible();
    // Both boxes are drawn where they were left, over the picture.
    await expect(portal.page.locator('[data-review-box="anchor"]')).toHaveCount(2);
    await expect(portal.page.locator('[data-review-box="callout"]')).toHaveCount(2);
    // The wording is in the box over the picture, which is also the editor
    // (`@@T-495`): there is no second list of comment fields beside it.
    const wording = portal.page.locator('[data-review-text]').first();
    await expect(wording).toHaveValue(/The label does not say which club/);

    /** The stored items, read through the same handler call the page opens with. */
    const readItems = async () =>
        (await portal.page.evaluate(async (id: string) => {
            const handler = (
                window as unknown as {
                    __blongHandler?: Record<string, (p: object, m: object) => Promise<unknown>>;
                }
            ).__blongHandler;
            const answer = await handler?.['feedback.session.items']?.({sessionId: id}, {});
            return JSON.parse(JSON.stringify(answer ?? {}));
        }, sessionId ?? '')) as {
            items?: Array<{refinedText?: string; callout?: {x: number; y: number}}>;
        };
    const beforeRows = await readItems();

    // A reviewer rewrites a comment in place. The new wording is a row update, so
    // the document generated afterwards quotes it instead of the original.
    await wording.fill('The club filter needs a label of its own.');
    await wording.blur();

    // A callout the reviewer drags stays where it was left, in the row. The first
    // box is flush with the picture's right edge — a drag that way is clamped to
    // where it already is — so the second one is the one that moves.
    const callout = portal.page.locator('[data-review-box="callout"]').nth(1);
    const beforeDrag = await callout.boundingBox();
    if (!beforeDrag) throw new Error('the callout has no box to drag');
    await callout.locator('div').first().hover();
    await portal.page.mouse.down();
    await portal.page.mouse.move(beforeDrag.x - 40, beforeDrag.y + 20, {steps: 5});
    await portal.page.mouse.up();
    const afterDrag = await callout.boundingBox();
    expect(afterDrag?.x).toBeLessThan(beforeDrag.x - 10);

    // Both of those were writes, not page state: the rows answer the new wording and
    // the box that the drag produced, and the page re-opening the session finds them
    // (`@@T-495`).
    // Both writes are dispatches the page does not await, so the rows are polled until
    // they answer with them rather than read once and hoped for.
    await expect
        .poll(async () => (await readItems()).items?.[0]?.refinedText)
        .toBe('The club filter needs a label of its own.');
    await expect
        .poll(async () => (await readItems()).items?.[1]?.callout?.x ?? 1)
        .toBeLessThan((beforeRows.items?.[1]?.callout?.x ?? 1) - 0.01);

    await portal.page.locator(`[data-feedback-queue-row="${sessionId}"]`).click();
    await expect(portal.page.locator('[data-review-text]').first()).toHaveValue(
        'The club filter needs a label of its own.',
    );
    // The pixel is not compared exactly: the box is stored as a fraction of the
    // picture, and the picture is a few pixels narrower once the pane has a scrollbar.
    const reopened = await portal.page.locator('[data-review-box="callout"]').nth(1).boundingBox();
    expect(reopened?.x ?? 0).toBeLessThan(beforeDrag.x - 10);

    // The document is rendered from the rows — nothing was stored to show it.
    const checkbox = portal.page.locator('label input[type="checkbox"]').first();
    await checkbox.check();
    await portal.page.getByRole('button', {name: 'Generate prose'}).click();
    await expect(portal.page.locator('pre')).toContainText('blong-feedback v1');
    // Every item is named by the path the page emitted — nothing was stored to
    // produce it.
    await expect(portal.page.locator('pre')).toContainText('column:legalName');
    await expect(portal.page.locator('pre')).toContainText('/label');
    // The reviewer's wording is the one quoted: it was written to the row, not to a
    // document.
    await expect(portal.page.locator('pre')).toContainText('needs a label of its own');
    // The detail pane, not the whole page: the queue beside it carries this run's
    // timestamps, which no baseline can reproduce.
    await expect(portal.page.locator('[data-feedback-detail]')).toHaveScreenshot(
        snapshotName('feedback-review-1.png'),
    );

    // Closing a comment takes it off the picture and out of the document, and the
    // list under the pane offers it back (`@@T-496`).
    await callout.getByRole('button', {name: 'Close this comment'}).click();
    await expect(portal.page.locator('[data-review-box="callout"]')).toHaveCount(1);
    await portal.page.getByRole('button', {name: 'Generate prose'}).click();
    await expect(portal.page.locator('pre')).not.toContainText('The header wraps and cuts the text.');
    await portal.page.getByRole('button', {name: 'legalName'}).click();
    await expect(portal.page.locator('[data-review-box="callout"]')).toHaveCount(2);
    await portal.page.getByRole('button', {name: 'Generate prose'}).click();
    await expect(portal.page.locator('pre')).toContainText('The header wraps and cuts the text.');

    // Marking it processed takes this session out of the default queue; the
    // sessions already in it are somebody else's and stay where they are.
    await portal.page.getByRole('button', {name: 'Mark processed'}).click();
    await expect(portal.page.locator(`[data-feedback-queue-row="${sessionId}"]`)).toHaveCount(0);
});
