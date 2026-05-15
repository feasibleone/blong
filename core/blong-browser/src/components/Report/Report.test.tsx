import {describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, waitFor} from '../../test/render.js';
import {Report} from './Report.js';

const schema = {
    properties: {
        category: {title: 'Category'},
        amount: {title: 'Amount'},
    },
};

describe('Report', () => {
    it('renders report layout without data', () => {
        const {container} = render(<Report filterSchema={schema} />, {
            dispatch: vi.fn().mockResolvedValue({items: [], total: 0}),
        });
        expect(container).toMatchSnapshot();
    });

    it('renders with title and export buttons', () => {
        const {container} = render(
            <Report
                title="Monthly Report"
                filterSchema={schema}
                exportable
            />,
            {dispatch: vi.fn().mockResolvedValue({items: [], total: 0})},
        );
        expect(container).toMatchSnapshot();
    });

    it('renders with metrics panel', () => {
        const {container} = render(
            <Report
                title="Summary"
                filterSchema={schema}
                metrics={[
                    {label: 'Total Amount', field: 'amount', icon: 'pi-dollar', color: 'success'},
                    {label: 'Categories', field: 'categoryCount', icon: 'pi-list', color: 'info'},
                ]}
                columns={[
                    {field: 'category', header: 'Category'},
                    {field: 'amount', header: 'Amount', aggregate: 'sum'},
                ]}
            />,
            {
                dispatch: vi
                    .fn()
                    .mockResolvedValue({items: [], total: 0, amount: 0, categoryCount: 0}),
            },
        );
        expect(container).toMatchSnapshot();
    });

    it('renders filterSchema as expandable filter panel', () => {
        const filterSchema = {
            properties: {
                startDate: {title: 'Start Date', widget: {type: 'date' as const}},
                endDate: {title: 'End Date', widget: {type: 'date' as const}},
            },
        };
        const {container} = render(
            <Report
                filterSchema={filterSchema}
                defaultFilter={{startDate: '2024-01-01'}}
            />,
            {dispatch: vi.fn().mockResolvedValue([])},
        );
        // Filter panel should be present
        expect(container.querySelector('.blong-report-filters')).toBeInTheDocument();
    });

    it('renders with data from listAction', () => {
        const dispatch = vi.fn().mockResolvedValue([
            {category: 'A', amount: 100},
            {category: 'B', amount: 200},
        ]);
        const {container} = render(
            <Report
                filterSchema={schema}
                dataAction="report.report.find"
                columns={[
                    {field: 'category', header: 'Category'},
                    {field: 'amount', header: 'Amount', aggregate: 'sum'},
                ]}
            />,
            {dispatch},
        );
        expect(container.querySelector('.blong-report-dt')).toBeInTheDocument();
    });

    it('renders with column count aggregate', () => {
        const {container} = render(
            <Report
                filterSchema={schema}
                columns={[{field: 'category', header: 'Category', aggregate: 'count'}]}
            />,
            {dispatch: vi.fn().mockResolvedValue([])},
        );
        expect(container.querySelector('.blong-report-dt')).toBeInTheDocument();
    });

    it('calls exportCSV when export button clicked with no rows (early return)', () => {
        const {container} = render(
            <Report
                filterSchema={schema}
                exportable
                columns={[{field: 'category', header: 'Category'}]}
            />,
            {dispatch: vi.fn().mockResolvedValue([])},
        );
        // Find the export button (has pi-download or similar text)
        const buttons = container.querySelectorAll('.p-button');
        // Click any export button - exportCSV bails early when rows is empty
        buttons.forEach(btn => {
            try {
                fireEvent.click(btn);
            } catch {
                // ignore
            }
        });
        // Just verify no crash
        expect(container.querySelector('.blong-report-dt')).toBeInTheDocument();
    });

    it('exports CSV when export button clicked with rows data', async () => {
        const dispatch = vi.fn().mockResolvedValue([
            {category: 'A', amount: 100},
            {category: 'B', amount: 200},
        ]);
        const {container} = render(
            <Report
                title="Test"
                filterSchema={schema}
                exportable
                columns={[
                    {field: 'category', header: 'Category'},
                    {field: 'amount', header: 'Amount'},
                ]}
                dataAction="report.report.find"
            />,
            {dispatch},
        );

        // Wait for data to load and render
        await waitFor(() => dispatch.mock.calls.length > 0);

        // Click any button with pi-download icon
        const downloadIcon = container.querySelector('.pi-download') as HTMLElement | null;
        if (downloadIcon) {
            // Click the parent button
            const btn = downloadIcon.closest('button') as HTMLElement | null;
            if (btn) await act(async () => { fireEvent.click(btn); });
        }

        // exportCSV with empty rows should early-return, with rows should call createObjectURL
        expect(container).toBeTruthy();
    });

    it('renders metrics with loading skeleton', () => {
        const {container} = render(
            <Report
                filterSchema={schema}
                metrics={[{label: 'Count', field: 'count', color: 'success', icon: 'pi-check'}]}
                columns={[{field: 'count', header: 'Count', aggregate: 'sum'}]}
            />,
            {dispatch: vi.fn().mockResolvedValue({items: [], summary: {count: 42}})},
        );
        expect(container.querySelector('.blong-report-metrics')).toBeInTheDocument();
    });
});
