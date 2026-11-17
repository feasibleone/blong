/**
 * Competition chain — competition → edition → participation → result.
 *
 * Each step's create reads the row the previous step made from its dropdown, so
 * the spec proves the whole chain of auto-bound pickers. The competition page
 * also lists its editions in a read-only card (`sport.competition.get` supplies
 * the array). @@D-597
 *
 * Names are fixed and every object is cleaned before it is created: a retry
 * re-evaluates the file, and a minted name would change under it while the row
 * the earlier attempt created stayed behind — two rows of one name also make a
 * dropdown label ambiguous.
 */
import {fillFields} from '@feasibleone/blong-browser/playwright/model';
import {expect, test} from '@feasibleone/blong-browser/playwright/shared';
import type {Page} from '@playwright/test';
import {browseModel, cleanupModel, createAndEditModel, quiet} from './sportPlay.js';

test.use({blongPermissions: true});

const competitionName = 'ENT-PLAY-CP Competition';
const editionName = 'ENT-PLAY-CP Edition';
const athleteName = 'ENT-PLAY-CP Athlete';
const athletics = 'Athletics';

/** One option of a dropdown answer, and the parent keys it carries beside its label. */
interface IDropdownOption {
    value: string;
    label: string;
    [parentKey: string]: unknown;
}

/** One call to the server through the page's handler proxy. */
async function api<T = unknown>(
    page: Page,
    method: string,
    params: Record<string, unknown> = {},
): Promise<T> {
    // The `integration` intent installs the proxy when the provider mounts, and the
    // fixture's login has already waited for it; asking again keeps a spec that calls
    // before rendering a page from racing it.
    await page.waitForFunction(
        () => typeof (window as {__blongHandler?: unknown}).__blongHandler === 'object',
        undefined,
        {timeout: 15_000},
    );
    return page.evaluate(
        ([name, args]) => {
            const handler = (window as {__blongHandler?: Record<string, unknown>}).__blongHandler;
            if (!handler) {
                throw new Error(
                    'the page exposed no `__blongHandler`: the integration intent (testHook) is off',
                );
            }
            return (handler[name] as (p: unknown, m: object) => Promise<unknown>)(args, {});
        },
        [method, params] as [string, Record<string, unknown>],
    ) as Promise<T>;
}

test.describe('Competition', () => {
    // Dependents first: a result points at a participation, which points at the
    // edition and the athlete.
    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'result',
        search: 'ENT-PLAY-CP result',
        removeMethod: 'sport.result.remove',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'participation',
        search: 'ENT-PLAY-CP team',
        removeMethod: 'sport.participation.remove',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'edition',
        search: editionName,
        removeMethod: 'sport.edition.remove',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'competition',
        search: competitionName,
        removeMethod: 'sport.competition.remove',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'competition',
        fields: {
            'competition.competitionName': competitionName,
            'competition.competitionKind': {widget: 'select', value: 'Olympic Games'},
            'competition.competitionStatus': {widget: 'select', value: 'Active'},
            'competition.sportId': {widget: 'dropdown', value: 'Athletics'},
        },
        editFields: {
            'competition.competitionIntlName': 'ENT-PLAY-CP International',
        },
        search: competitionName,
    });

    /**
     * The discipline list follows the sport — the form-level cascade a model declares
     * with a parent path (`competition.sportId`) while the option it narrows on carries
     * the key under `sportId`. @@D-789 @@D-875
     *
     * The expected labels come from the same dropdown answer the page was given, so the
     * spec asserts the narrowing rather than a copy of the seed: every option of the
     * chosen sport, and nothing from another one. Nothing is saved, so the competition
     * the earlier steps created keeps its own screenshots.
     */
    test('create sport competition — the discipline list follows the sport', async ({portal}) => {
        const page = portal.page;
        await portal.menuClick('sport.competition.browse');
        await portal.waitForTableData();
        await page.getByTestId('action-component-sport-competition-new').first().click();
        await portal.waitForFormLoad();

        await fillFields(page, {'competition.sportId': {widget: 'dropdown', value: athletics}});

        // A dropdown with more than eight options filters, so the panel and its items
        // are the visible ones — the sport's own panel is closed by the pick above.
        // The panel is what is waited for, not an item: a narrowed-to-nothing list is
        // the failure this spec exists to catch, so it has to reach the assertion.
        await page.getByTestId('competition-disciplineId').click();
        const panel = page.locator('.p-dropdown-panel:visible');
        await panel.waitFor({state: 'visible'});
        const shown = await panel.locator('.p-dropdown-item').allTextContents();

        const lists = await api<Record<string, IDropdownOption[]>>(page, 'sport.dropdown.list');
        const sportId = lists['sport.sport']?.find(option => option.label === athletics)?.value;
        expect(sportId, `'${athletics}' is a seeded sport`).toBeTruthy();
        const expected = (lists['sport.discipline'] ?? [])
            .filter(option => option.sportId === sportId)
            .map(option => option.label);

        // Named ends as well as the set, so a failure says which way it broke: an empty
        // list is the symptom this cascade had, and a whole list is the other failure.
        expect(expected.length, `'${athletics}' has seeded disciplines`).toBeGreaterThan(0);
        expect([...shown].sort()).toEqual([...expected].sort());
        expect(shown).toContain('Marathon');
        expect(shown).not.toContain('200 m Butterfly');
    });

    // After the create, and filtered to it: the table is unfiltered otherwise, so the
    // shot showed whichever rows the database happened to hold — four accumulated
    // `ENT-PLAY-CO-…` rows on the machine that captured the baseline, and `No rows.`
    // on a CI runner whose first spec file had not created one yet. No competition is
    // seeded, so there is no stable row to point at instead; the one this file makes
    // is the only deterministic subject, which is also how `athleteTabs.play.ts`
    // captures its browse page.
    browseModel(test, expect, {
        subject: 'sport',
        object: 'competition',
        searchText: competitionName,
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'edition',
        fields: {
            'edition.competitionId': {widget: 'dropdown', value: competitionName},
            'edition.editionName': editionName,
            'edition.editionYear': {widget: 'number', value: 2032},
            'edition.editionStatus': {widget: 'select', value: 'Planned'},
        },
        editFields: {
            'edition.hostCityName': 'ENT-PLAY-CP City',
        },
        search: editionName,
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'athlete',
        search: athleteName,
        removeMethod: 'sport.athlete.remove',
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'athlete',
        fields: {
            'athlete.personName': athleteName,
            'athlete.firstName': 'ENT-PLAY-CP',
            'athlete.lastName': 'Athlete',
            'athlete.athleteStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'athlete.nationality': 'BUL',
        },
        search: athleteName,
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'participation',
        fields: {
            'participation.editionId': {widget: 'dropdown', value: editionName},
            'participation.athleteId': {widget: 'dropdown', value: athleteName},
            'participation.sportId': {widget: 'dropdown', value: 'Athletics'},
            'participation.participationFormat': {widget: 'select', value: 'Individual'},
            'participation.participationStatus': {widget: 'select', value: 'Planned'},
            'participation.teamName': 'ENT-PLAY-CP team',
        },
        editFields: {
            'participation.participationNote': 'ENT-PLAY-CP note edited',
        },
        search: 'ENT-PLAY-CP team',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'result',
        fields: {
            'result.participationId': {
                widget: 'dropdown',
                value: `${editionName} · ${athleteName}`,
            },
            'result.resultKind': {widget: 'select', value: 'Medal'},
            'result.resultStatus': {widget: 'select', value: 'Preliminary'},
            'result.resultValue': 'ENT-PLAY-CP result',
        },
        editFields: {
            'result.resultUnit': 'pts',
        },
        search: 'ENT-PLAY-CP result',
    });
});
