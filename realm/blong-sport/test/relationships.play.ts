/**
 * Relationships — the coaching and support periods, and the affiliation of a
 * person with a club or federation.
 *
 * A period is a row with two ends and a date range, so the people on each side are
 * created here. Names are fixed and every created object is cleaned first: a
 * retry re-evaluates the file, so a minted name would change under it. @@D-600
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, cleanupModel, createAndEditModel, quiet} from './sportPlay.js';

test.use({blongPermissions: true});

const athleteName = 'ENT-PLAY-RL Athlete';
const coachName = 'ENT-PLAY-RL Coach';
const specialistName = 'ENT-PLAY-RL Specialist';
const clubName = 'ENT-PLAY-RL Club';

test.describe('Relationships', () => {
    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'coaching',
        search: 'ENT-PLAY-RL coaching basis',
        removeMethod: 'sport.coaching.remove',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'support',
        search: 'ENT-PLAY-RL support basis',
        removeMethod: 'sport.support.remove',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'affiliation',
        search: 'ENT-PLAY-RL affiliation basis',
        removeMethod: 'sport.affiliation.remove',
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
            'athlete.firstName': 'ENT-PLAY-RL',
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
        object: 'coach',
        search: coachName,
        removeMethod: 'sport.coach.remove',
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'coach',
        fields: {
            'coach.personName': coachName,
            'coach.firstName': 'ENT-PLAY-RL',
            'coach.lastName': 'Coach',
            'coach.coachStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'coach.nationality': 'BUL',
        },
        search: coachName,
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'specialist',
        search: specialistName,
        removeMethod: 'sport.specialist.remove',
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'specialist',
        fields: {
            'specialist.personName': specialistName,
            'specialist.firstName': 'ENT-PLAY-RL',
            'specialist.lastName': 'Specialist',
            'specialist.specialistStatus': {widget: 'select', value: 'Active'},
            'specialist.expertAreaId': {widget: 'dropdown', value: 'Sports Medicine'},
        },
        editFields: {
            'specialist.specialtyName': 'ENT-PLAY-RL specialty',
        },
        search: specialistName,
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'coaching',
        fields: {
            'coaching.athleteId': {widget: 'dropdown', value: athleteName},
            'coaching.coachId': {widget: 'dropdown', value: coachName},
            'coaching.sportId': {widget: 'dropdown', value: 'Athletics'},
            'coaching.coachRole': {widget: 'select', value: 'National Coach'},
            'coaching.linkStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'coaching.basisNote': 'ENT-PLAY-RL coaching basis edited',
        },
        search: 'ENT-PLAY-RL coaching basis',
    });

    // After the create, and filtered to its `basisNote`: a period is not seeded, so
    // the unfiltered shot is an empty table on a fresh database. @@D-623
    browseModel(test, expect, {
        subject: 'sport',
        object: 'coaching',
        searchText: 'ENT-PLAY-RL coaching basis',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'support',
        fields: {
            'support.athleteId': {widget: 'dropdown', value: athleteName},
            'support.specialistId': {widget: 'dropdown', value: specialistName},
            'support.sportId': {widget: 'dropdown', value: 'Athletics'},
            'support.expertRole': {widget: 'select', value: 'Medical Provision'},
            'support.linkStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'support.basisNote': 'ENT-PLAY-RL support basis edited',
        },
        search: 'ENT-PLAY-RL support basis',
    });

    // After the create, and filtered to its `basisNote`, for the reason the coaching
    // shot above is filtered. @@D-623
    browseModel(test, expect, {
        subject: 'sport',
        object: 'support',
        searchText: 'ENT-PLAY-RL support basis',
    });

    cleanupModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'club',
        search: clubName,
        removeMethod: 'sport.club.remove',
    });

    createAndEditModel(test, expect, {
        ...quiet,
        subject: 'sport',
        object: 'club',
        fields: {
            'club.legalName': clubName,
            'club.clubShortName': 'EPRL',
            'club.clubStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'club.registrationNumber': 'ENT-PLAY-RL-REG',
        },
        search: clubName,
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'affiliation',
        fields: {
            'affiliation.personResourceId': {
                widget: 'dropdown',
                value: `${athleteName} (athlete)`,
            },
            'affiliation.organisationId': {widget: 'dropdown', value: clubName},
            'affiliation.affiliationKind': {widget: 'select', value: 'Club'},
            'affiliation.affiliationStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'affiliation.basisNote': 'ENT-PLAY-RL affiliation basis edited',
        },
        search: 'ENT-PLAY-RL affiliation basis',
    });
});
