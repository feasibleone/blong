/**
 * People pages — athlete, coach and specialist CRUD.
 *
 * `cleanupModel` deletes rows a previous run left behind (`ENT-PLAY-*`) so a
 * re-run does not accumulate; `browseModel` filters to the seeded marker so
 * test-created rows never leak into the baseline capture.
 *
 * The athlete is the layout reference: its form is a flat profile payload split
 * across `party_person` and `sport_athlete`, with a dropdown into the classifier
 * tables (`sport.sport`, `sport.discipline`). @@D-595 @@D-596
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, cleanupModel, createAndEditModel} from './sportPlay.js';

test.use({blongPermissions: true});

test.describe('People', () => {
    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'athlete',
        // Only this spec's rows: the other specs mint `ENT-PLAY-<prefix>` names,
        // and a bare `ENT-PLAY` here would delete their athletes — whose
        // participations the foreign key then refuses to orphan.
        search: 'ENT-PLAY-00',
        removeMethod: 'sport.athlete.remove',
    });

    browseModel(test, expect, {
        subject: 'sport',
        object: 'athlete',
        searchText: 'Sample Athlete One',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'athlete',
        fields: {
            'athlete.personName': 'ENT-PLAY-001 Athlete',
            'athlete.firstName': 'ENT-PLAY-001',
            'athlete.lastName': 'Athlete',
            'athlete.athleteStatus': {widget: 'select', value: 'Active'},
            'athlete.primarySportId': {widget: 'dropdown', value: 'Athletics'},
        },
        editFields: {
            'athlete.personName': 'ENT-PLAY-001 Athlete Edited',
        },
        search: 'ENT-PLAY-001',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'coach',
        fields: {
            'coach.personName': 'ENT-PLAY-002 Coach',
            'coach.firstName': 'ENT-PLAY-002',
            'coach.lastName': 'Coach',
            'coach.coachStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'coach.personName': 'ENT-PLAY-002 Coach Edited',
        },
        search: 'ENT-PLAY-002',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'specialist',
        fields: {
            'specialist.personName': 'ENT-PLAY-003 Specialist',
            'specialist.firstName': 'ENT-PLAY-003',
            'specialist.lastName': 'Specialist',
            'specialist.specialistStatus': {widget: 'select', value: 'Active'},
            'specialist.expertAreaId': {widget: 'dropdown', value: 'Sports Medicine'},
        },
        editFields: {
            'specialist.personName': 'ENT-PLAY-003 Specialist Edited',
        },
        search: 'ENT-PLAY-003',
    });
});
