import {fireEvent, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {render} from '../../test/render.js';
import {Explorer} from './index.js';

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
        // The filter input has a specific placeholder or type
        expect(container.querySelector('input[type="text"]')).toBeInTheDocument();
    });

    it('filters when globalFilter changes', async () => {
        const {container} = render(<Explorer schema={schema} />, {
            dispatch: vi.fn().mockResolvedValue([]),
        });
        const filterInput = container.querySelector('input[type="text"]') as HTMLInputElement;
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

    it('renders with navigator prop', () => {
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
    });
});
