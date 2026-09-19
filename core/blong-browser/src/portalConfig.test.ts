import {describe, expect, it} from 'vitest';
import {mergePortalConfigs} from './portalConfig.js';
import type {IPortalConfig} from './types/portal.js';

/** The union menu every model provider on the port answers with. */
const modelAnswer: Partial<IPortalConfig> = {
    name: 'blong-portal',
    title: 'Blong Suite',
    menu: [
        {title: 'Marine', items: ['marine.coral.browse', 'marine.fish.browse']},
    ],
};

/** A realm that writes its pages by hand. */
const handWrittenAnswer: Partial<IPortalConfig> = {
    name: 'blong-realm',
    title: 'Semantic Log',
    menu: [
        {
            title: 'Observe',
            items: [{title: 'Flows', method: 'blong.flow.browse', icon: 'pi pi-sitemap'}],
        },
    ],
};

describe('mergePortalConfigs', () => {
    it('keeps every provider’s pages, in provider order', () => {
        const config = mergePortalConfigs([modelAnswer, handWrittenAnswer]);
        expect(config.menu?.map(entry => (entry as {title: string}).title)).toEqual([
            'Marine',
            'Observe',
        ]);
    });

    it('does not repeat the menu every model provider answers with', () => {
        // Two model groups read the same accumulated map, so both answer with the
        // same union menu — a plain concatenation would list each page twice.
        const config = mergePortalConfigs([modelAnswer, modelAnswer, handWrittenAnswer]);
        expect(config.menu).toHaveLength(2);
        expect((config.menu?.[0] as {items: string[]}).items).toEqual([
            'marine.coral.browse',
            'marine.fish.browse',
        ]);
    });

    it('merges two providers’ groups of the same title', () => {
        const config = mergePortalConfigs([
            {menu: [{title: 'Marine', items: ['marine.coral.browse']}]},
            {menu: [{title: 'Marine', items: ['marine.fish.browse']}]},
        ]);
        expect(config.menu).toHaveLength(1);
        expect((config.menu?.[0] as {items: string[]}).items).toEqual([
            'marine.coral.browse',
            'marine.fish.browse',
        ]);
    });

    it('takes name, title and the scalar settings from the first provider that sets them', () => {
        const config = mergePortalConfigs([
            {},
            {...modelAnswer, home: {title: 'Home', method: 'marine.home.browse'}},
            {...handWrittenAnswer, languages: [{value: 'bg', label: 'Bulgarian'}]},
        ]);
        // The first provider is normally the model aggregator, which reads the
        // suite's own `ui.portal.portal` slice — so the suite keeps its title.
        expect(config.name).toBe('blong-portal');
        expect(config.title).toBe('Blong Suite');
        // `IAction` is a method name or an object, so the field is read after narrowing —
        // which is what the shell does before it opens the page.
        const home = config.home as {method?: string} | undefined;
        expect(home?.method).toBe('marine.home.browse');
        expect(config.languages).toEqual([{value: 'bg', label: 'Bulgarian'}]);
    });

    it('ignores empty answers and empty values', () => {
        const config = mergePortalConfigs([
            undefined,
            null,
            {name: '', title: '', menu: []},
            {title: 'Blong Gateway'},
        ]);
        expect(config.title).toBe('Blong Gateway');
        expect(config.menu).toBeUndefined();
        expect(config.name).toBe('blong-portal');
    });

    it('falls back to a usable config when no realm answers', () => {
        const config = mergePortalConfigs([]);
        expect(config.name).toBe('blong-portal');
        expect(config.title).toBe('Blong');
        expect(config.menu).toBeUndefined();
    });

    it('merges the right-hand menu by the same rule', () => {
        const config = mergePortalConfigs([
            {rightMenu: [{title: 'Help', items: ['ui.help.browse']}]},
            {rightMenu: [{title: 'Help', items: ['ui.help.about']}]},
        ]);
        expect(config.rightMenu).toHaveLength(1);
        expect((config.rightMenu?.[0] as {items: string[]}).items).toEqual([
            'ui.help.browse',
            'ui.help.about',
        ]);
    });
});
