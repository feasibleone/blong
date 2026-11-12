/**
 * Reference pages — the classifier tables every other page points at.
 *
 * `sport`, `discipline`, `cycle` and `area` are resource-backed, so
 * each carries its readable name in `core_resource` and the browse shows the
 * `col-12 xl:col-6` two-card layout. @@D-608
 */
import {expect, test} from '@feasibleone/blong-browser/playwright/shared';
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
        // The discipline page navigates the sports and lists only the selected
        // one's disciplines, so the leftovers are searched inside the branch the
        // create test writes to.
        navigatorNode: 'Athletics',
    });

    createAndEditModel(test, expect, {
        subject: 'sport',
        object: 'discipline',
        fields: {
            'discipline.disciplineName': 'ENT-PLAY-DI-01 Discipline',
            'discipline.disciplineKind': {widget: 'select', value: 'Individual'},
            'discipline.disciplineSex': {widget: 'select', value: 'Mixed'},
            'discipline.disciplineStatus': {widget: 'select', value: 'Active'},
            'discipline.sportId': {widget: 'dropdown', value: 'Athletics'},
        },
        editFields: {
            'discipline.disciplineCode': 'DI01',
        },
        search: 'ENT-PLAY-DI-01',
        navigatorNode: 'Athletics',
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

    // The created sports stay behind until the *next* run's cleanup, and the
    // discipline page navigates them — so `bgModels` pictured this run's leftover
    // in the tree. Removing it here leaves the database as the run found it.
    cleanupModel(test, expect, {
        subject: 'sport',
        object: 'sport',
        search: 'ENT-PLAY-SP',
        removeMethod: 'sport.sport.remove',
        title: 'cleanup the sport this spec created',
        screenshot: {capture: {cleanupConfirm: false}},
    });

    /**
     * The areas are removed through the handler, not the page.
     *
     * An area is deleted by *deactivating* it (`deletion: {mode: 'deactivate'}`),
     * and a deactivated record is still a row: the cleanup above only marks the
     * previous run's area inactive, so every run adds one more
     * `ENT-PLAY-AR-01 Area Edited`. The edit test opens the first row its search
     * matches, and the older, inactive record is as good a first row as the one
     * this run made — which is how a baseline ends up picturing last run's data.
     * The remove handler behind that button is a real delete, so the leftovers go
     * through it.
     */
    test('purge the areas this spec created', async ({portal}) => {
        const areas = await portal.call<Array<{areaId: string}>>('sport.area.find', {
            filterBy: {areaName: 'ENT-PLAY-AR-01 Area Edited'},
        });
        for (const area of areas) await portal.call('sport.area.remove', {areaId: area.areaId});
        const left = await portal.call<Array<{areaId: string}>>('sport.area.find', {
            filterBy: {areaName: 'ENT-PLAY-AR-01 Area Edited'},
        });
        expect(left, 'the areas this spec created are gone').toHaveLength(0);
    });
});
