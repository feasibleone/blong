/**
 * Athlete tabs — one capture per tab of the athlete editor.
 *
 * The model helpers photograph the form as a whole; this spec walks the thumb
 * index instead, because the athlete page is the layout reference and its tab set
 * (identification, sports profile, results, Olympic status, awards, documents) is
 * the part a reviewer has to look at. @@D-608
 *
 * The four child tabs are tables over the arrays `profileGet` projects, so the
 * spec builds the rows before it opens the page — empty tables would picture the
 * empty state six times and the layout not at all. Results needs the whole chain
 * (competition → edition → participation), which is why this file also creates a
 * competition and an edition of its own.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, cleanupModel, createAndEditModel, quiet, snapshotName} from './sportPlay.js';

test.use({blongPermissions: true});

const athleteName = 'ENT-PLAY-TAB Athlete';
const tabAthlete = `${athleteName} (athlete)`;
const competitionName = 'ENT-PLAY-TAB Competition';
const editionName = 'ENT-PLAY-TAB Edition';

const tabs = [
    'Identification',
    'Sports Profile',
    'Results',
    'Olympic Status',
    'Awards',
    'Documents',
];

test.describe('Athlete tabs', () => {
    // Dependents first: a participation points at the edition, the edition at the
    // competition, and the athlete holds all of them.
    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'participation',
        search: 'ENT-PLAY-TAB team',
        removeMethod: 'sport.participation.remove',
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'edition',
        search: editionName,
        removeMethod: 'sport.edition.remove',
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'competition',
        search: competitionName,
        removeMethod: 'sport.competition.remove',
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'campaign',
        search: 'ENT-PLAY-TAB rating body',
        removeMethod: 'sport.campaign.remove',
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'conferral',
        search: 'ENT-PLAY-TAB award basis',
        removeMethod: 'sport.conferral.remove',
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'attachment',
        search: 'ENT-PLAY-TAB document note',
        removeMethod: 'sport.attachment.remove',
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
            'athlete.firstName': 'ENT-PLAY-TAB',
            'athlete.lastName': 'Athlete',
            'athlete.athleteStatus': {widget: 'select', value: 'Active'},
        },
        search: athleteName,
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'competition',
        fields: {
            'competition.competitionName': competitionName,
            'competition.competitionKind': {widget: 'select', value: 'Olympic Games'},
            'competition.competitionStatus': {widget: 'select', value: 'Active'},
            'competition.sportId': {widget: 'dropdown', value: 'Athletics'},
        },
        search: competitionName,
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'edition',
        fields: {
            'edition.competitionId': {widget: 'dropdown', value: competitionName},
            'edition.editionName': editionName,
            'edition.editionYear': {widget: 'number', value: 2032},
            'edition.editionStatus': {widget: 'select', value: 'Planned'},
        },
        search: editionName,
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'participation',
        fields: {
            'participation.editionId': {widget: 'dropdown', value: editionName},
            'participation.athleteId': {widget: 'dropdown', value: athleteName},
            // The discipline is nullable and no sport seed carries one, so the row
            // leaves it out rather than depending on another spec's fixture.
            'participation.sportId': {widget: 'dropdown', value: 'Athletics'},
            'participation.participationFormat': {widget: 'select', value: 'Individual'},
            'participation.participationStatus': {widget: 'select', value: 'Planned'},
            'participation.teamName': 'ENT-PLAY-TAB team',
        },
        search: 'ENT-PLAY-TAB team',
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'campaign',
        fields: {
            'campaign.athleteId': {widget: 'dropdown', value: athleteName},
            'campaign.cycleId': {widget: 'dropdown', value: 'Paris 2024'},
            'campaign.olympicStatus': {widget: 'select', value: 'Qualified'},
            'campaign.ratingOrganisationName': 'ENT-PLAY-TAB rating body',
        },
        search: 'ENT-PLAY-TAB rating body',
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'conferral',
        fields: {
            'conferral.awardId': {widget: 'dropdown', value: 'Order of Stara Planina'},
            'conferral.recipientResourceId': {widget: 'dropdown', value: tabAthlete},
            'conferral.conferralStatus': {widget: 'select', value: 'Nominated'},
            'conferral.basisNote': 'ENT-PLAY-TAB award basis',
        },
        search: 'ENT-PLAY-TAB award basis',
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'attachment',
        fields: {
            'attachment.documentId': {
                widget: 'dropdown',
                value: 'Olympic Quota Confirmation 2024',
            },
            'attachment.targetResourceId': {widget: 'dropdown', value: tabAthlete},
            'attachment.attachmentRole': {widget: 'select', value: 'Proof'},
            'attachment.attachmentNote': 'ENT-PLAY-TAB document note',
        },
        search: 'ENT-PLAY-TAB document note',
    });

    browseModel(test, expect, {
        subject: 'sport',
        object: 'athlete',
        searchText: athleteName,
        baselinePrefix: 'athlete-tabs-browse',
    });

    test('athlete editor tabs', async ({portal}) => {
        await portal.menuClick('sport.athlete.browse');
        await portal.waitForTableData();

        const search = portal.page.getByTestId('browse-search');
        await search.fill(athleteName);
        await portal.page.waitForTimeout(600);
        await portal.waitForTableData();

        const rows = portal.page.locator('.p-datatable-tbody tr:not(.p-datatable-emptymessage)');
        await rows.first().click();
        await portal.page.getByTestId('action-component-sport-athlete-open').first().click();
        await portal.waitForFormLoad();
        await portal.waitForFormData();

        for (const label of tabs) {
            await portal.page
                .locator('.blong-thumbindex .p-panelmenu-header-content, .p-panelmenu-header')
                .filter({hasText: label})
                .first()
                .click();
            await portal.page.waitForTimeout(300);
            await expect(portal.page).toHaveScreenshot(
                snapshotName(`athlete-tab-${label.toLowerCase().replace(/\s+/g, '-')}-open.png`),
            );
        }
    });
});
