import type {IModelSpec} from '@feasibleone/blong';
import {withDefaults} from '@feasibleone/blong-mock';
import {describe, expect, it} from 'vitest';
import {mergePortalConfigs} from '../portalConfig.js';
import {addMenuEntry, CLASSIFIER_ROOT, menuGroups, menuLeaf, menuPlacement} from './menu.js';

/** A model with the aggregator's defaults applied, as the menu builder sees it. */
function model(spec: Partial<IModelSpec> & {object: string}): ReturnType<typeof withDefaults> {
    return withDefaults({subject: 'sport', ...spec});
}

function build(models: IModelSpec[]): Record<string, unknown[]> {
    const menus: Record<string, unknown[]> = {};
    for (const spec of models) addMenuEntry(menus as never, withDefaults(spec));
    return menus;
}

describe('menuPlacement', () => {
    it('keeps a plain model in its subject group', () => {
        expect(menuPlacement(model({object: 'athlete', subjectTitle: 'Sport'}))).toEqual({
            root: 'Sport',
        });
    });

    it('puts a classifier under the shared root, one submenu per realm', () => {
        expect(
            menuPlacement(model({object: 'sport', classifier: true, subjectTitle: 'Sport'})),
        ).toEqual({root: CLASSIFIER_ROOT, group: 'Sport'});
    });

    it('lets a realm name the classifier root and submenu', () => {
        expect(
            menuPlacement(
                model({
                    object: 'sport',
                    classifier: true,
                    menu: {root: 'Reference', group: 'Codes'},
                }),
            ),
        ).toEqual({root: 'Reference', group: 'Codes'});
    });

    it('treats a group without a root as a flat group of its own', () => {
        expect(menuPlacement(model({object: 'athlete', menu: {group: 'People'}}))).toEqual({
            root: 'People',
        });
    });

    it('nests when both root and group are named', () => {
        expect(
            menuPlacement(model({object: 'athlete', menu: {root: 'People', group: 'Athletes'}})),
        ).toEqual({root: 'People', group: 'Athletes'});
    });

    it('places no entry for a hidden page', () => {
        expect(menuPlacement(model({object: 'athlete', menu: {hidden: true}}))).toBeUndefined();
    });
});

describe('menuLeaf', () => {
    it('carries the page label the slice would resolve, and its method', () => {
        expect(menuLeaf(model({object: 'athlete'}))).toEqual({
            title: 'Athlete',
            method: 'sport.athlete.browse',
        });
    });

    it('carries a title, an icon and an order when the model overrides them', () => {
        expect(
            menuLeaf(
                model({
                    object: 'athlete',
                    menu: {title: 'Athletes', icon: 'pi pi-user', order: 3},
                }),
            ),
        ).toEqual({
            title: 'Athletes',
            method: 'sport.athlete.browse',
            icon: 'pi pi-user',
            order: 3,
        });
    });
});

describe('menuGroups', () => {
    it('groups pages per placement and lists the classifier root last', () => {
        const menus = build([
            model({object: 'sport', classifier: true, subjectTitle: 'Sport'}),
            model({object: 'athlete', subjectTitle: 'Sport'}),
            model({object: 'club', subjectTitle: 'Sport', menu: {group: 'Registry'}}),
        ]);
        const groups = menuGroups(menus as never) as Array<{id: string; title: string}>;
        expect(groups.map(group => group.title)).toEqual(['Sport', 'Registry', CLASSIFIER_ROOT]);
        // Ids are language-independent and unique even though both the `Sport`
        // group and the classifier submenu open a `sport.*` page.
        expect(groups.map(group => group.id)).toEqual(['sport', 'registry', 'classifiers']);
    });

    it('nests one submenu per realm inside the classifier root', () => {
        const menus = build([
            model({object: 'sport', classifier: true, subjectTitle: 'Sport'}),
            model({object: 'area', classifier: true, subjectTitle: 'Sport'}),
            model({object: 'coral', subject: 'marine', classifier: true, subjectTitle: 'Marine'}),
        ]);
        const [classifiers] = (
            menuGroups(menus as never) as Array<{
                items: Array<{id: string; title: string; items: Array<{method: string}>}>;
            }>
        ).filter(group => (group as unknown as {title: string}).title === CLASSIFIER_ROOT);
        // Alphabetical by label: `Marine` before `Sport`.
        expect(classifiers.items.map(group => group.title)).toEqual(['Marine', 'Sport']);
        // The submenu is qualified by its root: its title collides with the realm's
        // own `Sport` group, and the portal's test ids must not.
        expect(classifiers.items.map(group => group.id)).toEqual([
            'classifiers-marine',
            'classifiers-sport',
        ]);
        // The leaves of the submenu are sorted too — no model ordered them.
        expect(classifiers.items[1].items.map(leaf => leaf.method)).toEqual([
            'sport.area.browse',
            'sport.sport.browse',
        ]);
    });

    it('survives composition with a realm that adds its own group', () => {
        const menus = build([model({object: 'athlete', subjectTitle: 'Sport'})]);
        const composed = mergePortalConfigs([
            {menu: menuGroups(menus as never)},
            {menu: [{title: 'Test', items: ['sport.test.run']}]},
        ]);
        expect(composed.menu?.map(entry => (entry as {title: string}).title)).toEqual([
            'Sport',
            'Test',
        ]);
        // Two model providers answer with the same union menu; composition dedupes
        // it, including into a same-titled group.
        const twice = mergePortalConfigs([
            {menu: menuGroups(menus as never)},
            {menu: menuGroups(menus as never)},
        ]);
        expect(
            (twice.menu?.[0] as {items: Array<{method: string}>}).items.map(leaf => leaf.method),
        ).toEqual(['sport.athlete.browse']);
    });

    it('keeps the order the models name and appends the rest alphabetically', () => {
        const menus = build([
            model({object: 'coach', objectTitle: 'Coach', subjectTitle: 'Sport', menu: {order: 4}}),
            model({object: 'club', objectTitle: 'Club', subjectTitle: 'Sport', menu: {order: 3}}),
            model({
                object: 'athlete',
                objectTitle: 'Athlete',
                subjectTitle: 'Sport',
                menu: {order: 2},
            }),
            model({object: 'affiliation', objectTitle: 'Affiliation', subjectTitle: 'Sport'}),
            model({
                object: 'federation',
                objectTitle: 'Federation',
                subjectTitle: 'Sport',
                menu: {order: 1},
            }),
            model({object: 'zebra', objectTitle: 'Zebra', subjectTitle: 'Sport'}),
        ]);
        const [sport] = menuGroups(menus as never) as Array<{
            items: Array<{title: string; order?: number}>;
        }>;
        expect(sport.items.map(leaf => leaf.title)).toEqual([
            'Federation',
            'Athlete',
            'Club',
            'Coach',
            'Affiliation',
            'Zebra',
        ]);
        // The sort key is not part of the menu the portal renders.
        expect(sport.items.some(leaf => leaf.order !== undefined)).toBe(false);
    });

    it('sorts a group alphabetically when no page names an order', () => {
        const menus = build([
            model({object: 'coach', objectTitle: 'Coach'}),
            model({object: 'athlete', objectTitle: 'Athlete'}),
            model({object: 'club', objectTitle: 'Club'}),
        ]);
        const [sport] = menuGroups(menus as never) as Array<{
            items: Array<{title: string}>;
        }>;
        expect(sport.items.map(leaf => leaf.title)).toEqual(['Athlete', 'Club', 'Coach']);
    });
});
