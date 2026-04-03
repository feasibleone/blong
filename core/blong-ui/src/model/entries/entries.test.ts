/**
 * Tests for model entry factory functions.
 * Each factory returns an async function that resolves to a page entry
 * (title, permission, icon, component).
 */
import React from 'react';
import {beforeAll, describe, expect, it, vi} from 'vitest';
import {render} from '../../test/render.js';
import type {IResolvedModelSpec} from '../types.js';

// Mock dynamic component imports used inside the entry factories
vi.mock('../../components/Explorer/index.js', () => ({
    Explorer: vi.fn().mockReturnValue(null),
}));
vi.mock('../../components/Editor/index.js', () => ({
    Editor: vi.fn().mockReturnValue(null),
}));
vi.mock('../../components/Report/index.js', () => ({
    Report: vi.fn().mockReturnValue(null),
}));

function makeModel(overrides: Partial<IResolvedModelSpec> = {}): IResolvedModelSpec {
    return {
        subject: 'test',
        object: 'item',
        objectTitle: 'Item',
        keyField: 'itemId',
        nameField: 'item.itemName',
        schema: {properties: {}},
        cards: {},
        browser: {
            title: 'Items',
            icon: 'pi pi-list',
            permission: {
                browse: 'test.item.browse',
                add: 'test.item.add',
                edit: 'test.item.edit',
                delete: 'test.item.delete',
            },
            fetch: p => p,
            filter: {},
            resultSet: '',
            create: [],
            toolbar: [],
        },
        editor: {resultSet: ''},
        report: {title: 'Item Report', permission: 'test.item.report'},
        layouts: {edit: []},
        methods: {
            find: 'test.item.find',
            get: 'test.item.get',
            add: 'test.item.add',
            edit: 'test.item.edit',
            remove: 'test.item.remove',
            report: 'test.item.report',
        },
        ...overrides,
    };
}

const mockSchema = {
    properties: {
        itemId: {type: 'string', title: 'ID'},
        itemName: {type: 'string', title: 'Name'},
    },
};

describe('subjectObjectBrowse', () => {
    let subjectObjectBrowse: typeof import('./subjectObjectBrowse.js').subjectObjectBrowse;
    beforeAll(async () => ({subjectObjectBrowse} = await import('./subjectObjectBrowse.js')));

    it('returns async factory that resolves to browse entry', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const model = makeModel();
        const factory = subjectObjectBrowse(model, loadSchema);
        expect(typeof factory).toBe('function');

        const entry = await factory();
        expect(entry.title).toBe('Items');
        expect(entry.permission).toBe('test.item.browse');
        expect(entry.icon).toBe('pi pi-list');
        expect(typeof entry.component).toBe('function');
    });

    it('component factory loads schema and returns a React component', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const model = makeModel();
        const factory = subjectObjectBrowse(model, loadSchema);
        const entry = await factory();
        const Page = await entry.component({});
        expect(Page).toBeDefined();
        expect(loadSchema).toHaveBeenCalled();
    });

    it('browse page uses cards.browse.widgets as column definitions', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const model = makeModel({
            cards: {browse: {label: 'Browse', widgets: ['itemId', 'itemName']}},
        });
        const factory = subjectObjectBrowse(model, loadSchema);
        const entry = await factory();
        const Page = await entry.component({});
        expect(Page).toBeDefined();
    });

    it('renders BrowsePage component', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const model = makeModel({
            cards: {browse: {label: 'Browse', widgets: ['itemId', 'item.itemName']}},
        });
        const factory = subjectObjectBrowse(model, loadSchema);
        const entry = await factory();
        const Page = (await entry.component({})) as React.ComponentType<Record<string, unknown>>;
        const {container} = render(React.createElement(Page, {}));
        expect(container).toBeTruthy();
    });
});

describe('subjectObjectNew', () => {
    let subjectObjectNew: typeof import('./subjectObjectNew.js').subjectObjectNew;
    beforeAll(async () => ({subjectObjectNew} = await import('./subjectObjectNew.js')));

    it('returns async factory that resolves to new-item entry', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const factory = subjectObjectNew(makeModel(), loadSchema);
        expect(typeof factory).toBe('function');

        const entry = await factory();
        expect(entry.title).toBe('Create Item');
        expect(entry.permission).toBe('test.item.add');
        expect(entry.icon).toBe('pi pi-plus');
        expect(typeof entry.component).toBe('function');
    });

    it('renders NewPage component', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const factory = subjectObjectNew(makeModel(), loadSchema);
        const entry = await factory();
        const Page = (await entry.component()) as React.ComponentType<Record<string, unknown>>;
        const {container} = render(React.createElement(Page, {}));
        expect(container).toBeTruthy();
    });
});

describe('subjectObjectOpen', () => {
    let subjectObjectOpen: typeof import('./subjectObjectOpen.js').subjectObjectOpen;
    beforeAll(async () => ({subjectObjectOpen} = await import('./subjectObjectOpen.js')));

    it('returns async factory that resolves to open-item entry', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const factory = subjectObjectOpen(makeModel(), loadSchema);

        const entry = await factory({itemId: '123'});
        expect(entry.title).toBe('Edit Item');
        expect(entry.permission).toBe('test.item.edit');
        expect(entry.icon).toBe('pi pi-pencil');
        expect(entry.params).toEqual({itemId: '123'});
    });

    it('component factory loads schema and returns a React component', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const factory = subjectObjectOpen(makeModel(), loadSchema);
        const entry = await factory({itemId: '456'});
        const Page = await entry.component();
        expect(Page).toBeDefined();
        expect(loadSchema).toHaveBeenCalled();
    });

    it('renders OpenPage component', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const factory = subjectObjectOpen(makeModel(), loadSchema);
        const entry = await factory({itemId: '456'});
        const Page = (await entry.component()) as React.ComponentType<Record<string, unknown>>;
        const {container} = render(React.createElement(Page, {}));
        expect(container).toBeTruthy();
    });
});

describe('subjectObjectReport', () => {
    let subjectObjectReport: typeof import('./subjectObjectReport.js').subjectObjectReport;
    beforeAll(async () => ({subjectObjectReport} = await import('./subjectObjectReport.js')));

    it('returns async factory that resolves to report entry', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const factory = subjectObjectReport(makeModel(), loadSchema);

        const entry = await factory();
        expect(entry.title).toBe('Item Report');
        expect(entry.permission).toBe('test.item.report');
        expect(entry.icon).toBe('pi pi-chart-bar');
    });

    it('component factory loads schema and returns a React component', async () => {
        const loadSchema = vi.fn().mockResolvedValue(mockSchema);
        const factory = subjectObjectReport(makeModel(), loadSchema);
        const entry = await factory();
        const Page = await entry.component();
        expect(Page).toBeDefined();
        expect(loadSchema).toHaveBeenCalled();
    });
});
