/**
 * Deletion modes — the four ways a model's delete resolves.
 *
 * A model declares one of `prompt`, `cascade`, `block` or `deactivate`, and the browse page's
 * delete button carries it (`@@D-784`). The realm is the worked example: a profile asks first, a
 * classifier that other records point at refuses, a row that belongs to a parent goes with it, and
 * an expert area is retired rather than removed.
 *
 * What each test asserts is the **answer**, not the picture: the dependant scan is read through the
 * handler, the dialog and the refusal are read as text, and the rows are counted afterwards. None of
 * that depends on the theme, so the spec needs no baselines.
 *
 * Fixtures are created through the server with the page's own handler proxy — the `integration`
 * intent exposes it as `window.__blongHandler` — because walking five create forms to reach a delete
 * would test the forms, and every name is fixed and purged first so a retry finds what its earlier
 * attempt left behind.
 */
import type {Portal} from '@feasibleone/blong-browser/playwright';
import {expect, test} from '@feasibleone/blong-browser/playwright/shared';
import type {Page} from '@playwright/test';

test.use({blongPermissions: true});

const athleteName = 'ENT-PLAY-DM Athlete';
const areaName = 'ENT-PLAY-DM Expert Area';
const competitionName = 'ENT-PLAY-DM Competition';
const editionName = 'ENT-PLAY-DM Edition';
const participationNote = 'ENT-PLAY-DM participation';
const athletics = 'Athletics';

/** A row of a browse table, excluding the empty-state row the DataTable renders as one. */
const dataRows = (page: Page) =>
    page.locator('.p-datatable-tbody tr:not(.p-datatable-emptymessage)');

/** The record in the open browse table, selected. */
async function selectOnlyRow(page: Page, text: string): Promise<void> {
    const row = dataRows(page).filter({hasText: text}).first();
    await expect(row).toBeVisible();
    await row.click();
}

/**
 * The only row the table holds, selected.
 *
 * The browse search matches the entity's own text columns, and a row whose
 * identifying value is a joined label (a participation's athlete) is narrowed by a
 * column of its own instead — the note — and then taken as the single row.
 */
async function selectFirstRow(page: Page): Promise<void> {
    const row = dataRows(page).first();
    await expect(row).toBeVisible();
    await row.click();
}

/** One call to the server through the page's handler proxy. */
async function api<T = unknown>(
    page: Page,
    method: string,
    params: Record<string, unknown> = {},
): Promise<T> {
    // The proxy is installed when the provider mounts, which the fixture's login has
    // already waited for; asking again here keeps a spec that starts with a call (this
    // one does, to purge) from racing the mount.
    await page
        .waitForFunction(
            () => typeof (window as {__blongHandler?: unknown}).__blongHandler === 'object',
            undefined,
            {
                timeout: 15_000,
            },
        )
        .catch(() => undefined);
    return page.evaluate(
        async ([name, args]) => {
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

/** The options of a named dropdown, or a failure naming the one that came back empty. */
async function options(page: Page, name: string): Promise<Array<{value: string; label: string}>> {
    const lists = await api<Record<string, Array<{value: string; label: string}>>>(
        page,
        'sport.dropdown.list',
    );
    const list = lists[name] ?? [];
    if (!list.length) throw new Error(`the '${name}' dropdown came back empty`);
    return list;
}

/** The id of the option with this label. */
async function optionId(page: Page, name: string, label: string): Promise<string> {
    const found = (await options(page, name)).find(option => option.label === label);
    if (!found) throw new Error(`'${label}' is not an option of '${name}'`);
    return found.value;
}

/**
 * Remove everything this spec creates, so a retry starts from the same state.
 *
 * The competition goes first with `cascade`: it takes its editions, and through them the
 * participations and results a previous attempt left. The athlete then takes its conferrals and
 * attachments, and the area is removed by id — a deactivated record is still a row.
 */
async function purge(page: Page): Promise<void> {
    const competitions = await api<Array<{competitionId: string}>>(page, 'sport.competition.find', {
        filterBy: {competitionName},
    });
    for (const row of competitions) {
        await api(page, 'sport.competition.remove', {
            competitionId: row.competitionId,
            cascade: true,
        });
    }
    const athletes = await api<Array<{athleteId: string}>>(page, 'sport.athlete.find', {
        filterBy: {personName: athleteName},
    });
    for (const row of athletes) {
        await api(page, 'sport.athlete.remove', {athleteId: row.athleteId, cascade: true});
    }
    const areas = await api<Array<{areaId: string}>>(page, 'sport.area.find', {
        filterBy: {areaName},
    });
    for (const row of areas) {
        await api(page, 'sport.area.remove', {areaId: row.areaId});
    }
}

/** Open a browse page and narrow its table to the rows this spec is about. */
async function openBrowse(portal: Portal, method: string, search: string): Promise<void> {
    await portal.menuClick(method);
    await portal.waitForTableData();
    await portal.page.getByTestId('browse-search').fill(search);
    await portal.page.waitForTimeout(600); // debounce + refetch
    await portal.waitForTableData();
}

async function createAthlete(page: Page): Promise<string> {
    const created = await api<{athlete: {athleteId: string}}>(page, 'sport.athlete.add', {
        athlete: {
            personName: athleteName,
            firstName: 'ENT-PLAY-DM',
            lastName: 'Athlete',
            athleteStatus: 'active',
        },
    });
    return created.athlete.athleteId;
}

test.describe('Deletion modes', () => {
    test('prompt: the dialog names what goes with the record', async ({portal}) => {
        const page = portal.page;
        await purge(page);
        const athleteId = await createAthlete(page);
        await api(page, 'sport.conferral.add', {
            conferral: {
                awardId: (await options(page, 'sport.award'))[0].value,
                recipientResourceId: athleteId,
                conferralStatus: 'nominated',
                basisNote: 'ENT-PLAY-DM basis',
            },
        });

        // The answer a `prompt` decides on, read from the server rather than from the page.
        const scan = await api<{
            dependants: Array<{table: string; label: string; count: number}>;
            total: number;
        }>(page, 'sport.athlete.scan', {athleteId});
        expect(scan.dependants).toContainEqual({
            table: 'sport_conferral',
            column: 'recipientResourceId',
            label: 'conferral',
            count: 1,
        });
        // The party row the profile extends is its identity, not a dependent.
        expect(scan.dependants.map(entry => entry.table)).not.toContain('party_person');

        await openBrowse(portal, 'sport.athlete.browse', athleteName);
        await selectOnlyRow(page, athleteName);
        await page.getByTestId('action-sport-athlete-remove').first().click();

        const dialog = page.locator('.p-confirm-dialog-message');
        await expect(dialog).toContainText('1 conferral');
        await page.locator('.p-confirm-dialog-accept').click();

        await expect(dataRows(page).filter({hasText: athleteName})).toHaveCount(0);
        const left = await api<unknown[]>(page, 'sport.conferral.find', {
            filterBy: {recipientResourceId: athleteId},
        });
        expect(left).toHaveLength(0);
    });

    test('block: a classifier other records point at is refused with the counts', async ({
        portal,
    }) => {
        const page = portal.page;
        const sportId = await optionId(page, 'sport.sport', athletics);

        const scan = await api<{dependants: Array<{label: string; count: number}>; total: number}>(
            page,
            'sport.sport.scan',
            {sportId},
        );
        expect(scan.total).toBeGreaterThan(0);

        await openBrowse(portal, 'sport.sport.browse', athletics);
        await selectOnlyRow(page, athletics);
        await page.getByTestId('action-sport-sport-remove').first().click();

        // `block` never asks: the refusal is the answer, and it is on screen for two seconds.
        await expect(page.getByText(/Cannot delete this record:/)).toBeVisible();
        await expect(page.locator('.p-confirm-dialog-message')).toHaveCount(0);
        // The record the delete was refused for is still there.
        await expect(dataRows(page).filter({hasText: athletics})).toHaveCount(1);
    });

    test('cascade: the rows that refer to the record go without asking', async ({portal}) => {
        const page = portal.page;
        await purge(page);
        const athleteId = await createAthlete(page);
        const sportId = await optionId(page, 'sport.sport', athletics);
        const competition = await api<{competition: {competitionId: string}}>(
            page,
            'sport.competition.add',
            {
                competition: {
                    competitionName,
                    competitionKind: 'championship',
                    competitionStatus: 'active',
                    sportId,
                },
            },
        );
        const edition = await api<{edition: {editionId: string}}>(page, 'sport.edition.add', {
            edition: {
                competitionId: competition.competition.competitionId,
                editionName,
                editionYear: 2032,
                editionStatus: 'planned',
            },
        });
        const participation = await api<{participation: {participationId: string}}>(
            page,
            'sport.participation.add',
            {
                participation: {
                    editionId: edition.edition.editionId,
                    athleteId,
                    sportId,
                    participationFormat: 'individual',
                    participationStatus: 'planned',
                    participationNote,
                },
            },
        );
        const participationId = participation.participation.participationId;
        await api(page, 'sport.result.add', {
            result: {
                participationId,
                resultKind: 'ranking',
                resultValue: 'ENT-PLAY-DM 1',
                resultStatus: 'official',
            },
        });

        const scan = await api<{total: number}>(page, 'sport.participation.scan', {
            participationId,
        });
        expect(scan.total).toBe(1);

        // Narrowed by its own note: the row's athlete is a joined label, which the
        // browse search does not match.
        await openBrowse(portal, 'sport.participation.browse', participationNote);
        await selectFirstRow(page);
        await page.getByTestId('action-sport-participation-remove').first().click();

        await expect(dataRows(page)).toHaveCount(0);
        const results = await api<unknown[]>(page, 'sport.result.find', {
            filterBy: {participationId},
        });
        expect(results).toHaveLength(0);
    });

    test('deactivate: the record is hidden, not removed', async ({portal}) => {
        const page = portal.page;
        await purge(page);
        const created = await api<{area: {areaId: string}}>(page, 'sport.area.add', {
            area: {areaName, areaStatus: 'active'},
        });
        const areaId = created.area.areaId;

        await openBrowse(portal, 'sport.area.browse', areaName);
        await selectOnlyRow(page, areaName);
        await page.getByTestId('action-sport-area-remove').first().click();

        // No question and no delete: the row stays and its status changes.
        await expect(dataRows(page).filter({hasText: areaName})).toContainText('Inactive');
        await expect(page.locator('.p-confirm-dialog-message')).toHaveCount(0);
        const stored = await api<{area: {areaStatus: string}}>(page, 'sport.area.get', {areaId});
        expect(stored.area.areaStatus).toBe('inactive');
    });
});
