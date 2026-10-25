/**
 * Olympic pages — the campaign (an athlete in a cycle) and the qualification
 * record that justifies it.
 *
 * Both hang off an athlete and a cycle, so the spec creates its own of each. The
 * names are fixed and every object is cleaned before it is created: a retry
 * re-evaluates this file, and a name minted per run would change under it while
 * the row created by the previous attempt stayed behind.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, cleanupModel, createAndEditModel, quiet} from './sportPlay.js';

test.use({blongPermissions: true});

const athleteName = 'ENT-PLAY-OL Athlete';
const cycleName = 'ENT-PLAY-OL Cycle';

test.describe('Olympic', () => {
    // Dependents first: the campaign and the qualification point at the athlete
    // and the cycle, and their delete is refused while those rows exist.
    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'campaign',
        search: 'ENT-PLAY-OL rating body',
        removeMethod: 'sport.campaign.remove',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'qualification',
        search: 'ENT-PLAY-OL basis',
        removeMethod: 'sport.qualification.remove',
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
            'athlete.firstName': 'ENT-PLAY-OL',
            'athlete.lastName': 'Athlete',
            'athlete.athleteStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'athlete.nationality': 'BUL',
        },
        search: athleteName,
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'cycle',
        search: cycleName,
        removeMethod: 'sport.cycle.remove',
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'cycle',
        fields: {
            'cycle.cycleName': cycleName,
            'cycle.cycleStartYear': {widget: 'number', value: 2032},
            'cycle.cycleEndYear': {widget: 'number', value: 2035},
            'cycle.cycleStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'cycle.gamesName': 'ENT-PLAY-OL Games',
        },
        search: cycleName,
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'campaign',
        fields: {
            'campaign.athleteId': {widget: 'dropdown', value: athleteName},
            'campaign.cycleId': {widget: 'dropdown', value: cycleName},
            'campaign.olympicStatus': {widget: 'select', value: 'Qualified'},
            'campaign.ratingOrganisationName': 'ENT-PLAY-OL rating body',
        },
        editFields: {
            'campaign.olympicResult': 'ENT-PLAY-OL result',
        },
        search: 'ENT-PLAY-OL rating body',
    });

    // After the create, and filtered to what it wrote: `ratingOrganisationName` is a
    // stored string column, so the server-side search narrows the table to this spec's
    // campaign. Unfiltered, the shot pictured whatever campaigns the database held — a
    // stale `ENT-PLAY-OL-…` row in the baseline (minted before the spec's names became
    // fixed), another spec's row in the CI run that failed.
    browseModel(test, expect, {
        subject: 'sport',
        object: 'campaign',
        searchText: 'ENT-PLAY-OL rating body',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'qualification',
        fields: {
            'qualification.athleteId': {widget: 'dropdown', value: athleteName},
            'qualification.cycleId': {widget: 'dropdown', value: cycleName},
            'qualification.sportId': {widget: 'dropdown', value: 'Athletics'},
            'qualification.qualificationKind': {widget: 'select', value: 'Quota'},
            'qualification.qualificationStatus': {widget: 'select', value: 'Pending'},
            'qualification.basisNote': 'ENT-PLAY-OL basis',
        },
        editFields: {
            'qualification.basisNote': 'ENT-PLAY-OL basis edited',
        },
        search: 'ENT-PLAY-OL basis',
    });
});
