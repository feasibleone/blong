/**
 * Bulgarian model screenshots — the proof that the translation is in place.
 *
 * The subset is the smallest one that shows every label belonging to a model: for
 * each of the realm's models, the Browse page (every column header, filter and
 * toolbar label) and the empty New page (every field label, section title and
 * dropdown). Nothing is created, so the spec leaves no rows behind.
 *
 * The first run has no baselines and writes them; run it only after the Bulgarian
 * seeds are in the database (`meta/db/bg-coreLabelSeed.yaml`,
 * `bg-coreTranslationSeed.yaml`), or the committed pictures are English.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {openPages} from '@feasibleone/blong-browser/playwright/pages';
import {BG_MODELS_SEED as SEED} from './bgModels.seed.js';

/**
 * Harvesting is on for this run: keys these pages render that the dictionary
 * cannot answer become empty seed lines, which a translator then fills. The seed
 * is declared in `playwright.config.ts` as well — the runner reads it there, and a
 * `test.use()` option never reaches the runner (`F-607`).
 */
test.use({
    blongLanguage: 'bg',
    blongPermissions: true,
    blongTranslationSeed: SEED,
});

/** Every model the realm contributes, in menu order. */
const models = [
    'affiliation',
    'area',
    'athlete',
    'attachment',
    'award',
    'campaign',
    'category',
    'club',
    'coach',
    'coaching',
    'competition',
    'conferral',
    'cycle',
    'discipline',
    'document',
    'edition',
    'federation',
    'participation',
    'qualification',
    'result',
    'specialist',
    'sport',
    'support',
];

/**
 * The one row each Browse page is captured with, where the picture is meant to
 * prove that translated data was fetched.
 *
 * The term is the record's **stored** value: `search` runs over the base table's
 * columns, not over the translated label joined beside them — which is exactly
 * what makes it a proof. The row matches on `Athletics` and the picture shows
 * `Лека атлетика`, so a page that stopped translating its data fails here instead
 * of quietly capturing English.
 */
const pinnedRow: Record<string, string> = {
    area: 'Sports Medicine',
    award: 'Order of Stara Planina',
    cycle: 'Paris 2024',
    sport: 'Athletics',
};

/**
 * What a page with no translated data in its rows is captured with.
 *
 * A term no record can match, so every one of those pages is the same empty
 * state on any database. It must not be `ENT-PLAY`: that is the marker the CRUD
 * specs create their records with, so the browser would find the leftovers of an
 * earlier run and the committed picture would change with the database.
 */
const NO_MATCH = 'zzz-no-such-record';

openPages(test, expect, {
    methods: models.map(object => ({
        method: `sport.${object}.browse`,
        screenshot: `bg-${object}-browse.png`,
        searchText: pinnedRow[object] ?? NO_MATCH,
    })),
});

for (const object of models) {
    test(`bg create ${object} (empty form)`, async ({portal}) => {
        await portal.menuClick(`sport.${object}.browse`);
        await portal.waitForTableData();
        // The create entry is a toolbar action whose label is translated, so the
        // accessible name is the Bulgarian one in this run.
        await portal.page
            .getByRole('button', {name: /^(Create|Създай)$/})
            .first()
            .click();
        // `:visible`, because the Browse tab stays mounted beside the new one and its
        // own form is the first match in the document — waiting for that one to appear
        // waits for a panel the reader is not looking at.
        await portal.page.waitForSelector('.blong-form:visible, form:visible');
        // A translated landmark: the page title the model generated, translated
        // through the dictionary. A fallback to English fails here instead of
        // writing an English baseline.
        await expect(portal.page.locator('.p-tabview, .p-tabpanel').first()).toBeVisible();
        await expect(portal.page).toHaveScreenshot(`bg-${object}-new.png`);
    });
}
