/**
 * Documentation images for the Editor feature guide (`concepts/editor-features.md`).
 *
 * `concepts/editor-features.md` is one section per capability, and until now only two of them had a
 * picture — the two the marine suite happens to photograph. The rest described in prose a widget
 * that is much faster to recognise than to read about: a skeleton row, a cascaded dropdown, a pivot
 * table, design mode with its property panel.
 *
 * The pictures are taken from the stories that demonstrate the feature, because a story *is* the
 * running example the page points a reader at. Those stories live in this package, and the
 * Storybook that serves them is this package's own (`core/blong-browser/.storybook`, port 6006) —
 * a realm's Storybook composes model pages and does not serve the `Editor/…` story group.
 * `playwright.config.ts` starts that dev server as the run's webServer, so regenerating the images
 * is one command and no second terminal.
 *
 * Two things are done to a story before it is photographed, both for the reader's sake:
 *
 * - The preview decorator renders every story inside `App` with `portal.debug: true`
 *   (`.storybook/dispatch.tsx`), which puts a debug-only Form Inspector rail on the right of every
 *   story. It is a devtool, not the feature, so it is hidden with a style tag rather than cropped —
 *   hiding it also gives the form the width it has in an application.
 * - An open dropdown list is a portal on `body`, outside the editor element. A capture clipped to
 *   the editor would cut off the very list the picture is about, so the cascaded-dropdown image
 *   photographs the viewport and every other image clips to `.blong-editor`.
 *
 * The Storybook images are written into `docs/blong/docs/concepts/img/` and nothing is asserted
 * about their bytes: PNG rendering depends on fonts, so a docs image is reviewed rather than
 * byte-compared (see `src/playwright/docs.ts`).
 *
 * Regenerate with:
 *
 *     BLONG_CAPTURE_DOCS=1 node --run playwright -- test/docs.play.ts
 *
 * Without `BLONG_CAPTURE_DOCS=1` the same spec runs as a smoke test — it opens each story and waits
 * for the state the picture is *of* — and writes no files, so a CI run cannot rewrite a committed
 * picture.
 */
import {expect, test, type Page} from '@playwright/test';

import {BLONG_ELEMENT_TIMEOUT} from '../src/playwright.js';
import {captureDocs} from '../src/playwright/docs.js';

/** Hidden before every capture: the preview's debug Form Inspector (see the file header). */
const HIDE_FORM_INSPECTOR = '.blong-inspector{display:none!important}';

/** Where the images live, relative to the docs tree. */
const IMAGE_DIR = 'concepts/img';

interface ICapture {
    /** Image name inside {@link IMAGE_DIR}, without the extension. */
    name: string;
    /** Storybook story id. */
    story: string;
    /** Selector that must be visible before the picture is taken. */
    ready: string;
    /**
     * Story viewport, tall enough for the story's own content.
     *
     * The preview pins a story to the viewport (`html, body {overflow: hidden}`), so a viewport
     * shorter than the form clips the form rather than letting the element clip capture it.
     */
    viewport: {width: number; height: number};
    /**
     * Clip to the editor instead of photographing the viewport. Left out for a picture of an open
     * dropdown, whose list is a portal on `body` (see the file header).
     */
    clip?: boolean;
    /** Reaches a state the story's own `play` does not leave it in, or checks the state it does. */
    drive?: (page: Page) => Promise<void>;
}

/** Select one option of a dropdown widget by its field name and show the option list. */
async function openDropdown(page: Page, field: string): Promise<void> {
    await page.getByTestId(field).click();
    await expect(page.locator('.p-dropdown-panel .p-dropdown-item').first()).toBeVisible();
}

/** Select an option by its label from the dropdown panel that is currently open. */
async function pickOption(page: Page, label: string): Promise<void> {
    await page.locator('.p-dropdown-panel .p-dropdown-item', {hasText: label}).first().click();
}

/**
 * The captured stories, in the order the guide's sections appear.
 *
 * `ready` is the state the image is of, not merely "something rendered": the smoke test on a run
 * that writes no files is worth exactly as much as what it waits for.
 */
const captures: readonly ICapture[] = [
    {
        // §2 Toolbar — the left-hand slot filled with realm actions (Browse / Open / Error / Delay)
        // beside Save and Reset, which is what `toolbar` is for.
        name: 'editor-toolbar',
        story: 'editor--toolbar',
        ready: 'text=Delay',
        viewport: {width: 1400, height: 1440},
        clip: true,
        drive: async page => {
            // The story's play presses the Error button, so the editor shows the refusal it
            // provoked; it clears itself a few seconds later, and the picture is of the toolbar.
            const error = page.getByText('Action failed on the server.');
            await expect(error).toBeVisible();
            await expect(error).toBeHidden({timeout: 15_000});
        },
    },
    {
        // §3 Validation — `play` clears the required Name and submits, so the picture is the
        // client-side rule and the dirty field the inspector reports.
        name: 'editor-validation',
        story: 'editor-validation--validation',
        ready: 'text=is required',
        viewport: {width: 1400, height: 1420},
        clip: true,
        drive: async page => {
            // The save the story's play performs also raises the app's validation toast, and how
            // soon it appears depends on the run. Waiting for it is what keeps the picture from
            // being two different pictures on two runs — and it is the error summary the section
            // describes, so it belongs in the picture rather than out of it.
            await expect(page.getByText('Validation error')).toBeVisible({timeout: 20_000});
        },
    },
    {
        // §4 Layouts — a tab or step layout is `{items: [...]}`: `layouts.edit` is an object here
        // where the flat layout is an array, and that shape is what selects the tab bar.
        name: 'editor-tabs',
        story: 'editor--tabs',
        ready: 'text=General',
        viewport: {width: 1400, height: 560},
        clip: true,
    },
    {
        // §5b Custom widgets — one registered `Period` editor owns the period and unit fields and
        // lays them out as a single row.
        name: 'editor-custom-editors',
        story: 'editor-customeditors--custom-editors',
        ready: 'text=Expiration period',
        viewport: {width: 1400, height: 300},
        clip: true,
    },
    {
        // §6 Loading — `coralCoralLoad` never resolves, so the per-field skeletons stay on screen.
        name: 'editor-loading',
        story: 'editor--loading',
        ready: '.p-skeleton',
        viewport: {width: 1400, height: 1100},
        clip: true,
    },
    {
        // §7 Design mode — `initialDesignMode` opens with the card grips and the property panel
        // already on screen. The `:not()` is what keeps the debug Form Inspector, which is also a
        // `.blong-property-editor`, from satisfying the wait.
        name: 'editor-design',
        story: 'editor--design',
        ready: '.blong-property-editor:not(.blong-inspector)',
        viewport: {width: 1400, height: 1850},
        clip: true,
    },
    {
        // §8 Master-detail — a detail card watching `$.selected.person`. `play` selects the first
        // row, so the picture is the populated detail form the section describes.
        name: 'editor-master-detail',
        story: 'editor-masterdetail--master-detail',
        ready: 'text=Personal Information',
        viewport: {width: 1400, height: 340},
        clip: true,
        drive: async page => {
            await expect(page.getByRole('textbox', {name: 'Full Name'})).toHaveValue('John Doe');
        },
    },
    {
        // §9 Cascaded dropdowns — `widget.parent` filters each list by its parent's value. The
        // picture is the city list holding one French city, which the section can only describe.
        // The story's own play races its own panels (it queries the option list before it has
        // rendered), so the state is reached here in steps that wait for each panel.
        name: 'editor-cascaded-dropdowns',
        story: 'editor-cascadeddropdowns--cascaded-dropdowns',
        ready: '[data-testid=city]',
        // Narrow on purpose: the story's card is `xl:col-3`, so a viewport under the `xl`
        // breakpoint gives the three fields the full width instead of a quarter of it, and the
        // open list beside them is the picture rather than a corner of it.
        viewport: {width: 700, height: 380},
        drive: async page => {
            // Let the story's play finish: it opens and closes the same panels, and two drivers on
            // one dropdown fight over whether the panel is open.
            await page.waitForTimeout(3_000);
            await page.keyboard.press('Escape');
            await openDropdown(page, 'continent');
            await pickOption(page, 'Europe');
            await openDropdown(page, 'country');
            await pickOption(page, 'France');
            await openDropdown(page, 'city');
            // The cascade: France's cities, not all ten of them, and the list is left open so the
            // reader sees the filtering rather than the value it produced.
            await expect(page.locator('.p-dropdown-panel .p-dropdown-item')).toHaveText(['Paris']);
        },
    },
    {
        // §10 Cascaded tables — `widget.parent` + `widget.master` filter the child tables by the
        // selected row. `play` selects John Doe, then his Driving License; the attachment table is
        // left holding that document's PNG pages.
        name: 'editor-cascaded-tables',
        story: 'editor-cascadedtables--cascaded-tables',
        ready: 'text=Attachment',
        viewport: {width: 1400, height: 470},
        clip: true,
        drive: async page => {
            // Five documents in the fixture, three of them the selected person's; four
            // attachments, two of them the selected document's. Counting the rows is the cascade:
            // the tables are filtered by the selection, not merely rendered next to it.
            await expect(
                page.locator('[data-testid="document"] .p-datatable-tbody tr'),
            ).toHaveCount(3);
            await expect(
                page.locator('[data-testid="attachment"] .p-datatable-tbody tr'),
            ).toHaveCount(2);
        },
    },
    {
        // §12 Pivot — the weekday schedule is seeded from `pivot.examples` and the permission
        // matrix from a `pivot.dropdown`, with the committed rows overlaid on both.
        name: 'editor-pivot',
        story: 'editor-pivot--pivot',
        ready: 'text=Schedule (static pivot)',
        viewport: {width: 1400, height: 880},
        clip: true,
        drive: async page => {
            await expect(page.locator('.blong-editor')).toContainText('Tuesday');
        },
    },
    {
        // §15 The form-based explorer — the composition the generated browse page is made of:
        // navigator, table, detail panel and the editor's toolbar above them. The story renders
        // with nothing selected, so a row is opened first.
        name: 'editor-explorer',
        story: 'editor-explorer--with-navigator',
        ready: 'text=Reef Corals',
        viewport: {width: 1400, height: 760},
        clip: true,
        drive: async page => {
            const row = page.locator('.p-datatable-tbody tr', {hasText: 'Staghorn Coral'}).first();
            await expect(row).toBeVisible();
            await row.click();
            await expect(page.getByRole('textbox', {name: 'Name'})).toHaveValue('Staghorn Coral');
        },
    },
];

for (const capture of captures) {
    test(`document ${capture.name}`, async ({page}) => {
        test.setTimeout(120_000);
        const browserErrors: string[] = [];
        page.on('pageerror', error => browserErrors.push(error.message));

        await page.setViewportSize(capture.viewport);
        await page.goto(`/iframe.html?id=${capture.story}&viewMode=story`);
        await page.addStyleTag({content: HIDE_FORM_INSPECTOR});

        await expect(page.locator(capture.ready).first()).toBeVisible({
            timeout: BLONG_ELEMENT_TIMEOUT * 3,
        });
        await capture.drive?.(page);

        await captureDocs(
            {page, browserErrors},
            {
                name: `${IMAGE_DIR}/${capture.name}.png`,
                ...(capture.clip === true ? {region: page.locator('.blong-editor')} : {}),
            },
        );
    });
}
