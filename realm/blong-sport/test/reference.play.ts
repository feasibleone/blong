/**
 * Reference pages — the classifier tables every other page points at.
 *
 * `sport`, `discipline`, `category`, `cycle` and `area` are resource-backed, so
 * each carries its readable name in `core_resource` and the browse shows the
 * `col-12 xl:col-6` two-card layout. @@D-608
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel, cleanupModel, createAndEditModel} from './sportPlay.js';

test.use({blongPermissions: true});

test.describe('Reference', () => {
    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'sport',
        search: 'ENT-PLAY-SP',
        removeMethod: 'sport.sport.remove',
    });

    browseModel(test, expect, {
        subject: 'sport',
        object: 'sport',
        searchText: 'Athletics',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'sport',
        fields: {
            'sport.sportName': 'ENT-PLAY-SP-01 Sport',
            'sport.sportCode': 'SP01',
            'sport.sportKind': {widget: 'select', value: 'Olympic'},
            'sport.sportStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'sport.sportIntlName': 'ENT-PLAY-SP-01 International',
        },
        search: 'ENT-PLAY-SP-01',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'discipline',
        search: 'ENT-PLAY-DI',
        removeMethod: 'sport.discipline.remove',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'discipline',
        fields: {
            'discipline.disciplineName': 'ENT-PLAY-DI-01 Discipline',
            'discipline.disciplineKind': {widget: 'select', value: 'Individual'},
            'discipline.disciplineStatus': {widget: 'select', value: 'Active'},
            'discipline.sportId': {widget: 'dropdown', value: 'Athletics'},
        },
        editFields: {
            'discipline.disciplineCode': 'DI01',
        },
        search: 'ENT-PLAY-DI-01',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'category',
        search: 'ENT-PLAY-CA',
        removeMethod: 'sport.category.remove',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'category',
        fields: {
            'category.categoryName': 'ENT-PLAY-CA-01 Category',
            'category.categoryKind': {widget: 'select', value: 'Age'},
            'category.categoryStatus': {widget: 'select', value: 'Active'},
            'category.sportId': {widget: 'dropdown', value: 'Athletics'},
        },
        editFields: {
            'category.categoryName': 'ENT-PLAY-CA-01 Category Edited',
        },
        search: 'ENT-PLAY-CA-01',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'cycle',
        search: 'ENT-PLAY-CY',
        removeMethod: 'sport.cycle.remove',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'cycle',
        fields: {
            'cycle.cycleName': 'ENT-PLAY-CY-01 Cycle',
            'cycle.cycleStartYear': {widget: 'number', value: 2032},
            'cycle.cycleEndYear': {widget: 'number', value: 2035},
            'cycle.cycleStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'cycle.gamesName': 'ENT-PLAY-CY-01 Games',
        },
        search: 'ENT-PLAY-CY-01',
    });

    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'area',
        search: 'ENT-PLAY-AR',
        removeMethod: 'sport.area.remove',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'area',
        fields: {
            'area.areaName': 'ENT-PLAY-AR-01 Area',
            'area.areaStatus': {widget: 'select', value: 'Active'},
        },
        editFields: {
            'area.areaName': 'ENT-PLAY-AR-01 Area Edited',
        },
        search: 'ENT-PLAY-AR-01',
    });
});
