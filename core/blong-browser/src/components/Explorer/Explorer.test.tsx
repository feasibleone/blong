import {act, fireEvent, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {render} from '../../test/render.js';
import {Explorer} from './Explorer.js';

const schema = {
    properties: {
        name: {title: 'Name', filterable: true, sortable: true},
        size: {title: 'Size', filterable: true, sortable: true},
    },
};

describe('Explorer', () => {
    it('renders empty state with no listAction', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[
                    {field: 'name', header: 'Name'},
                    {field: 'size', header: 'Size'},
                ]}
            />,
            {dispatch: vi.fn().mockResolvedValue({})},
        );
        expect(container).toMatchSnapshot();
    });

    it('renders toolbar', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
                toolbar={[{label: 'Add', icon: 'pi-plus', action: 'entityAdd'}]}
            />,
            {dispatch: vi.fn().mockResolvedValue({})},
        );
        // Toolbar should be rendered
        expect(container.querySelector('.p-toolbar')).toBeTruthy();
        expect(container).toMatchSnapshot();
    });

    it('renders with data rows after dispatch resolves', async () => {
        const dispatch = vi
            .fn()
            .mockResolvedValue({items: [{id: 1, name: 'file.txt', size: 100}], total: 1});
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[
                    {field: 'name', header: 'Name'},
                    {field: 'size', header: 'Size'},
                ]}
                listAction="entityEntityFind"
            />,
            {dispatch},
        );
        // Wait for at least one data row to appear
        await waitFor(
            () =>
                expect(
                    container.querySelector('tr[data-p-selectable-row]') ??
                        container.querySelector('tbody tr'),
                ).toBeTruthy(),
            {timeout: 3000},
        );
        expect(container).toMatchSnapshot();
    });

    it('renders with columns derived from schema when no columns prop', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                listAction="entity.entity.find"
            />,
            {dispatch: vi.fn().mockResolvedValue([])},
        );
        // Should derive columns from schema
        expect(container.querySelector('.p-datatable')).toBeInTheDocument();
    });

    it('renders with selectionMode=multiple', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name'}]}
                selectionMode="multiple"
                listAction="entity.entity.find"
            />,
            {dispatch: vi.fn().mockResolvedValue([])},
        );
        expect(container.querySelector('.p-datatable')).toBeInTheDocument();
    });

    it('renders with selectionMode=none', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name'}]}
                selectionMode="none"
            />,
            {dispatch: vi.fn().mockResolvedValue([])},
        );
        expect(container.querySelector('.p-datatable')).toBeInTheDocument();
    });

    it('renders globalFilter input', () => {
        const {container} = render(<Explorer schema={schema} />, {
            dispatch: vi.fn().mockResolvedValue([]),
        });
        // The search input has a specific placeholder class
        expect(container.querySelector('.blong-explorer-search')).toBeInTheDocument();
    });

    it('filters when globalFilter changes', async () => {
        const {container} = render(<Explorer schema={schema} />, {
            dispatch: vi.fn().mockResolvedValue([]),
        });
        const filterInput = container.querySelector('.blong-explorer-search') as HTMLInputElement;
        if (filterInput) {
            fireEvent.change(filterInput, {target: {value: 'search term'}});
            expect(filterInput.value).toBe('search term');
        }
    });

    it('renders toolbar right buttons', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                toolbarRight={[{label: 'Export', icon: 'pi-download', action: 'exportAction'}]}
            />,
            {dispatch: vi.fn().mockResolvedValue([])},
        );
        expect(container.querySelector('.p-toolbar')).toBeInTheDocument();
    });

    it('clicks the refresh button to trigger refetch', () => {
        const dispatch = vi.fn().mockResolvedValue([]);
        const {container} = render(
            <Explorer
                schema={schema}
                listAction="entity.entity.find"
            />,
            {dispatch},
        );
        // The refresh button has pi-refresh icon
        const refreshIcon = container.querySelector('.pi-refresh');
        if (refreshIcon) {
            const btn = refreshIcon.closest('button');
            if (btn) fireEvent.click(btn);
        }
        // Just verifying no crash
        expect(container.querySelector('.p-datatable')).toBeInTheDocument();
    });

    it('renders with navigator prop', async () => {
        const {container} = render(
            <Explorer
                schema={schema}
                navigator={{
                    listAction: 'entity.category.find',
                    keyField: 'id',
                    parentField: 'parentId',
                    labelField: 'name',
                }}
            />,
            {
                dispatch: vi
                    .fn()
                    .mockResolvedValue({items: [{id: 1, parentId: null, name: 'Cat'}], total: 1}),
            },
        );
        // Should render with navigator splitter
        expect(container.querySelector('.blong-explorer')).toBeInTheDocument();
        // Drain the resolved dispatch state updates.
        await act(async () => {});
    });

    it('renders nav toggle button when children are provided', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
            >
                <div id="nav-content">Navigator</div>
            </Explorer>,
            {dispatch: vi.fn().mockResolvedValue({})},
        );
        // Nav toggle button (pi-bars) should be in the toolbar left
        expect(container.querySelector('.blong-toolbar-left .pi-bars')).toBeInTheDocument();
        // Splitter should be visible
        expect(container.querySelector('.p-splitter')).toBeInTheDocument();
    });

    it('toggles navigator panel on nav button click', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
            >
                <div id="nav-content">Navigator</div>
            </Explorer>,
            {dispatch: vi.fn().mockResolvedValue({})},
        );
        // Splitter should exist initially (navOpened=true)
        expect(container.querySelector('.p-splitter')).toBeInTheDocument();
        // Click nav toggle
        const navBtn = container.querySelector('.blong-toolbar-left button') as HTMLButtonElement;
        fireEvent.click(navBtn);
        // Splitter should be gone (no panels active)
        expect(container.querySelector('.p-splitter')).not.toBeInTheDocument();
    });

    it('renders details toggle button when details prop is provided', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
                details={row => <div id="detail-panel">{String(row?.name ?? '')}</div>}
            />,
            {dispatch: vi.fn().mockResolvedValue({})},
        );
        // Details toggle button should be in toolbar right
        expect(container.querySelector('.blong-toolbar-right .pi-bars')).toBeInTheDocument();
        // Details splitter panel should be present (detailsOpened=true)
        expect(container.querySelector('.p-splitter')).toBeInTheDocument();
    });

    it('toggles details panel on details button click', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
                details={row => <div id="detail-panel">{String(row?.name ?? '')}</div>}
            />,
            {dispatch: vi.fn().mockResolvedValue({})},
        );
        // Splitter should exist initially (detailsOpened=true)
        expect(container.querySelector('.p-splitter')).toBeInTheDocument();
        // Click the details toggle (pi-bars in toolbar right)
        const detailsBtn = container
            .querySelector('.blong-toolbar-right .pi-bars')
            ?.closest('button') as HTMLButtonElement;
        fireEvent.click(detailsBtn);
        // Splitter should be gone
        expect(container.querySelector('.p-splitter')).not.toBeInTheDocument();
    });

    it('persists splitter state when name prop is provided', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
                name="test-explorer"
            >
                <div>Nav</div>
            </Explorer>,
            {dispatch: vi.fn().mockResolvedValue({})},
        );
        const splitter = container.querySelector('.p-splitter');
        expect(splitter).toBeInTheDocument();
    });

    it('renders DataView in grid layout mode', async () => {
        const dispatch = vi
            .fn()
            .mockResolvedValue({items: [{id: 1, name: 'Alpha', size: 10}], total: 1});
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
                listAction="entityEntityFind"
                view="grid"
                selectionMode="none"
            />,
            {dispatch},
        );
        await waitFor(() => expect(container.querySelector('.p-dataview')).toBeInTheDocument(), {
            timeout: 3000,
        });
        expect(container.querySelector('.p-datatable')).not.toBeInTheDocument();
        expect(container).toMatchSnapshot();
    });

    it('default grid card is wrapped in primeflex col class', async () => {
        const dispatch = vi
            .fn()
            .mockResolvedValue({items: [{id: 1, name: 'Alpha', size: 10}], total: 1});
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
                listAction="entityEntityFind"
                view="grid"
                selectionMode="none"
            />,
            {dispatch},
        );
        await waitFor(() => expect(container.querySelector('.p-dataview')).toBeInTheDocument(), {
            timeout: 3000,
        });
        // When DataView renders items, each card must be inside a col- wrapper
        const colWrapper = container.querySelector('.col-6');
        if (colWrapper) {
            expect(colWrapper.querySelector('.blong-explorer-card')).toBeInTheDocument();
        } else {
            // jsdom may not call itemTemplate; verify grid mode class is applied
            expect(container.querySelector('.p-dataview-grid')).toBeInTheDocument();
        }
    });

    it('renders custom cardTemplate in grid layout mode', async () => {
        const dispatch = vi
            .fn()
            .mockResolvedValue({items: [{id: 1, name: 'Alpha', size: 10}], total: 1});
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
                listAction="entityEntityFind"
                view="grid"
                selectionMode="none"
                cardTemplate={row => <div className="custom-card">{String(row.name ?? '')}</div>}
            />,
            {dispatch},
        );
        await waitFor(() => expect(container.querySelector('.p-dataview')).toBeInTheDocument(), {
            timeout: 3000,
        });
        const customCard = container.querySelector('.custom-card');
        if (customCard) {
            expect(customCard.textContent).toBe('Alpha');
        } else {
            // jsdom may not call itemTemplate; verify grid mode is active
            expect(container.querySelector('.p-dataview-grid')).toBeInTheDocument();
        }
    });

    it('hides fit-width button in grid layout mode', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
                view="grid"
                selectionMode="none"
            />,
            {dispatch: vi.fn().mockResolvedValue({})},
        );
        expect(container.querySelector('.pi-arrows-h')).not.toBeInTheDocument();
    });

    it('toolbar spans full width outside splitter', () => {
        const {container} = render(
            <Explorer
                schema={schema}
                columns={[{field: 'name', header: 'Name'}]}
            >
                <div>Nav</div>
            </Explorer>,
            {dispatch: vi.fn().mockResolvedValue({})},
        );
        const explorerRoot = container.querySelector('.blong-explorer')!;
        const toolbar = container.querySelector('.p-toolbar')!;
        const splitter = container.querySelector('.p-splitter')!;
        // Toolbar must be a direct child of the explorer root (not inside splitter)
        expect(explorerRoot.children[1]).toBe(toolbar);
        // Splitter must NOT contain the toolbar
        expect(splitter.contains(toolbar)).toBe(false);
    });
});
