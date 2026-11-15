/**
 * The document's file — a PDF attached through the asset widget, saved, and served back.
 *
 * The register keeps a `blob://` reference rather than a copy of the bytes (`@@D-842`), so what this
 * spec proves is the whole path a document takes: the three calls the widget makes, the two columns it
 * fills from what the store measured (`@@D-852`), and the read a reader performs by opening the record
 * again — the label is the served route, so the check is a real `GET` of the bytes.
 *
 * The capture set is the one the model helpers write, taken by hand because a file input is the one
 * step `fillFields` cannot take: `open`, `new-filled`, `saved`, `cleanup-confirm`.
 *
 * `page` is the shared worker page, not Playwright's own: importing `shared` leaves the `page` fixture
 * a blank tab, so everything here drives `portal.page` (`@@F-742`).
 */
import {fillFields} from '@feasibleone/blong-browser/playwright/model';
import {expect, test} from '@feasibleone/blong-browser/playwright/shared';

import type {Page} from '@playwright/test';
import {snapshotName} from './sportPlay.js';

/**
 * Call a method from the page's own handler proxy.
 *
 * The proxy is installed when the provider mounts, and its keys are the dotted method names
 * (`sport.document.remove`), which is what the suite's own specs use (`@@T-683`).
 */
async function api<T = unknown>(
    page: Page,
    method: string,
    params: Record<string, unknown> = {},
): Promise<T> {
    await page
        .waitForFunction(
            () => typeof (window as {__blongHandler?: unknown}).__blongHandler === 'object',
            undefined,
            {timeout: 15_000},
        )
        .catch(() => undefined);
    return page.evaluate(
        async ([name, args]) => {
            const handler = (window as {__blongHandler?: Record<string, unknown>}).__blongHandler;
            if (!handler) throw new Error('the page exposed no `__blongHandler`');
            return (handler[name as string] as (p: unknown, m: object) => Promise<unknown>)(
                args,
                {},
            );
        },
        [method, params] as [string, Record<string, unknown>],
    ) as Promise<T>;
}

test.use({blongPermissions: true});

/** A document with no pages is still a PDF: the store's allow-list decides by extension and type. */
const TINY_PDF = Buffer.from(
    [
        '%PDF-1.4',
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj',
        'trailer<</Root 1 0 R>>',
        '%%EOF',
        '',
    ].join('\n'),
);

const TITLE = 'ENT-PLAY-DOC Filed Decision';
const FIELD = 'document-referenceUrl';

test.describe('Sport document file', () => {
    test('attaches a PDF, serves it back, and removes it', async ({portal}) => {
        test.setTimeout(150_000);
        const page = portal.page;
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();
        // The bar paints before the composed menu lands in it: `portalConfigMerge` answers after login
        // and replaces the store's config, and the shell marks the document when that has happened. A
        // click taken before it finds no menu item at all — not even the group it would open.
        await expect(page.locator('html[data-portal-config="merged"]')).toBeAttached();

        /**
         * The rows this spec's title matches — visible ones only.
         *
         * `count()` also counts a table that is in the DOM but not on screen (the browse page holds the
         * navigator's and a hidden sibling), and a click on one of those waits forever.
         */
        const rows = () =>
            page
                .locator('.p-datatable-tbody tr:visible')
                .filter({hasText: TITLE})
                .filter({hasNotText: 'No available options'});

        /** Narrow the register to this spec's rows and wait for the filter to land. */
        const search = async () => {
            await portal.menuClick('sport.document.browse');
            await portal.waitForTableData();
            await expect(page.getByTestId('browse-search')).toBeVisible();
            await page.getByTestId('browse-search').fill(TITLE);
            await page.waitForTimeout(500);
            await portal.waitForTableData();
        };

        // A retry finds the row its earlier attempt left behind, and a fixed title keeps the screenshots
        // comparable. The removal goes through the method rather than the table: this is state control,
        // not the behaviour under test — the confirm dialog is proved at the end, where the capture is.
        const found = await api<Array<{documentId: string}>>(page, 'sport.document.find', {
            filterBy: {documentTitle: TITLE},
        });
        for (const doc of found ?? []) {
            await api(page, 'sport.document.remove', {documentId: doc.documentId});
        }

        // ── Create, with the file ───────────────────────────────────────────
        await search();
        await page.getByTestId('action-component-sport-document-new').first().click();
        await portal.waitForFormLoad();

        // The helper's own field filler: it detects each widget from the DOM, so a schema that switches
        // an option list from a dropdown to a select button is not a spec change.
        await fillFields(page, {
            'document.documentTitle': TITLE,
            'document.documentType': {widget: 'select', value: 'Decision'},
            'document.documentStatus': {widget: 'select', value: 'Valid'},
        });

        const file = page.locator(`[data-testid="${FIELD}"]`);
        await file.locator('input[type="file"]').setInputFiles({
            name: 'decision.pdf',
            mimeType: 'application/pdf',
            buffer: TINY_PDF,
        });
        // The commit answers the reference, and the two columns the store already knows are filled
        // from it rather than typed a second time.
        await expect(file.locator('.blong-asset__current')).toBeVisible({timeout: 60_000});
        await expect(page.locator('input[name="document.documentFormat"]')).toHaveValue('pdf');
        await expect
            .poll(() => page.locator('input[name="document.checksumValue"]').inputValue(), {
                timeout: 30_000,
            })
            .toMatch(/^[0-9a-f]{64}$/);
        await expect(page).toHaveScreenshot(snapshotName('sport-document-new-filled.png'));

        await portal.save();
        await expect(page).toHaveScreenshot(snapshotName('sport-document-saved.png'));
        // The create tab stays mounted behind the browse page it is followed by, and a second editor on
        // the page makes every locator ambiguous — one record, one editor (`@@F-743`).
        await portal.tabsCloseAll();

        // ── Reopen it ──────────────────────────────────────────────────────
        await search();
        await rows().first().click();
        await page.getByTestId('action-component-sport-document-open').first().click();
        await portal.waitForFormLoad();
        await portal.waitForFormData();

        // What the record kept is a reference, and the bytes behind it are served: both are asked of
        // the store rather than of the DOM, because an open record draws its form twice and the widget
        // learns the file's name from a call of its own.
        await expect(page).toHaveScreenshot(snapshotName('sport-document-open.png'));
        const stored = await api<Array<{referenceUrl?: string | null}>>(
            page,
            'sport.document.find',
            {filterBy: {documentTitle: TITLE}},
        );
        const referenceUrl = stored?.[0]?.referenceUrl ?? '';
        expect(referenceUrl, 'the record points at a blob').toMatch(/^blob:\/\/sport\/[^/]+$/);

        const key = referenceUrl.split('/').pop() as string;
        const bytes = await page.request.get(`/a/sport/${key}`);
        expect(bytes.status(), 'the served route answers the reference').toBe(200);
        expect(bytes.headers()['content-type']).toContain('application/pdf');

        // And the page itself: the file's own name, its format's icon, and the link a reader takes.
        const opened = page.locator(`[data-testid="${FIELD}"]`);
        await expect(page.getByText('decision.pdf').first()).toBeVisible({timeout: 30_000});
        await expect(opened.locator('a.blong-asset__link').first()).toHaveAttribute(
            'href',
            `/a/sport/${key}`,
        );
        await expect(opened.locator('.blong-asset__icon i.pi-file-pdf').first()).toBeAttached();

        // ── Remove the file, and keep the record ────────────────────────────
        await opened.getByRole('button', {name: /remove/i}).click();
        await portal.save();
        await portal.tabsCloseAll();

        // What was saved is what the store answers: no reference, and the record still there.
        const kept = await api<Array<{referenceUrl?: string | null}>>(page, 'sport.document.find', {
            filterBy: {documentTitle: TITLE},
        });
        expect(kept ?? [], 'the record is still there').toHaveLength(1);
        expect(
            kept?.[0]?.referenceUrl ?? null,
            'removing the file cleared the reference',
        ).toBeNull();

        // ── Clean up ───────────────────────────────────────────────────────
        await search();
        await rows().first().click();
        await page.getByTestId('action-sport-document-remove').first().click();
        await expect(page.locator('.p-confirm-dialog')).toBeVisible();
        await expect(page).toHaveScreenshot(snapshotName('sport-document-cleanup-confirm.png'));
        await page.locator('.p-confirm-dialog-accept').click();
        await portal.waitForTableData();
        await expect(rows()).toHaveCount(0);
    });
});
