/**
 * Organisation pages — federation and club.
 *
 * Both profiles share the `party.organization` primary key, so the form splits
 * one flat payload across the party row and the profile row. @@D-595
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, cleanupModel, createAndEditModel} from './sportPlay.js';

test.use({blongPermissions: true});

test.describe('Organisations', () => {
    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'federation',
        search: 'ENT-PLAY-FE',
        removeMethod: 'sport.federation.remove',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'federation',
        fields: {
            'federation.legalName': 'ENT-PLAY-FE-01 Federation',
            'federation.federationShortName': 'EPF01',
            'federation.sportId': {widget: 'dropdown', value: 'Athletics'},
            'federation.federationStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'federation.registrationNumber': 'ENT-PLAY-FE-01-REG',
        },
        search: 'ENT-PLAY-FE-01',
    });

    // After the create, and filtered to it: nothing seeds a federation, so an
    // unfiltered shot is `No rows.` on a fresh database — every declared column
    // hidden — and any row another spec adds would silently join the picture. @@D-623
    browseModel(test, expect, {
        subject: 'sport',
        object: 'federation',
        searchText: 'ENT-PLAY-FE-01',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'club',
        search: 'ENT-PLAY-CL',
        removeMethod: 'sport.club.remove',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'club',
        fields: {
            'club.legalName': 'ENT-PLAY-CL-01 Club',
            'club.clubShortName': 'EPC01',
            'club.clubStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'club.registrationNumber': 'ENT-PLAY-CL-01-REG',
        },
        search: 'ENT-PLAY-CL-01',
    });
});
