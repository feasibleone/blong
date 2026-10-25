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
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, cleanupModel, createAndEditModel, quiet} from './sportPlay.js';

test.use({blongPermissions: true});

const competitionName = 'ENT-PLAY-CP Competition';
const editionName = 'ENT-PLAY-CP Edition';
const athleteName = 'ENT-PLAY-CP Athlete';

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

    browseModel(test, expect, {
        subject: 'sport',
        object: 'competition',
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
