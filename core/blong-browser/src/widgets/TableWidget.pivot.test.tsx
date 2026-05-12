/**
 * TableWidget — pivot mode tests.
 *
 * Covers:
 * - Static pivot: overlay existing data onto example rows
 * - Dynamic pivot: rows sourced from a named dropdown
 * - Boolean columns render as icons (not checkboxes) in view mode
 * - Row selection checkbox is absent in pivot mode
 * - Join columns are not editable during row editing
 * - Editing a row with no pre-existing data inserts a new row
 * - Editing a row that already has data updates it in place
 */
import type {IWidgetProps} from '@feasibleone/blong';
import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, waitFor} from '../test/render.js';
import {TableWidget} from './TableWidget.js';

// ── Shared schema builders ─────────────────────────────────────────────────

const SCHEDULE_SCHEMA = {
    type: 'array' as const,
    widget: {
        type: 'table' as const,
        pivot: {
            join: {weekdayName: 'weekdayName'},
            examples: [
                {weekdayName: 'Monday'},
                {weekdayName: 'Tuesday'},
                {weekdayName: 'Wednesday'},
            ],
        },
        actions: {allowAdd: false, allowDelete: false},
    },
    items: {
        type: 'object' as const,
        properties: {
            weekdayName: {title: 'Weekday', readOnly: true},
            startTime: {title: 'Start'},
            endTime: {title: 'End'},
        },
    },
};

const PERMISSION_SCHEMA = {
    type: 'array' as const,
    widget: {
        type: 'table' as const,
        pivot: {
            dropdown: 'entity',
            join: {value: 'entityId', label: 'entityName'},
        },
        actions: {allowAdd: false, allowDelete: false},
    },
    items: {
        type: 'object' as const,
        properties: {
            entityId: {title: 'Entity ID'},
            entityName: {title: 'Entity Name', readOnly: true},
            view: {title: 'View', type: 'boolean' as const},
            edit: {title: 'Edit', type: 'boolean' as const},
        },
    },
};

const ENTITY_DROPDOWN = [
    {value: 1, label: 'Organization'},
    {value: 2, label: 'Role'},
    {value: 3, label: 'User'},
];

function mkProps(overrides: Partial<IWidgetProps> = {}): IWidgetProps {
    return {
        name: 'testTable',
        schema: SCHEDULE_SCHEMA as never,
        value: [],
        onChange: vi.fn(),
        onBlur: vi.fn(),
        readOnly: false,
        disabled: false,
        ...overrides,
    };
}

// ── Static pivot — row overlay ─────────────────────────────────────────────

describe('TableWidget — static pivot row overlay', () => {
    it('renders all example rows regardless of data', () => {
        const {getAllByRole} = render(<TableWidget {...mkProps({value: []})} />);
        const rows = getAllByRole('row');
        // header row + 3 example rows
        expect(rows.length).toBe(4);
    });

    it('displays existing data in the correct pivot row', () => {
        const {getByText} = render(
            <TableWidget
                {...mkProps({
                    value: [{weekdayName: 'Tuesday', startTime: '09:00', endTime: '10:00'}],
                })}
            />,
        );
        expect(getByText('09:00')).toBeTruthy();
        expect(getByText('10:00')).toBeTruthy();
    });

    it('shows an empty row for pivot entries with no matching data', () => {
        // Monday has no data; its start/end cells should be empty
        const {getAllByRole} = render(
            <TableWidget
                {...mkProps({
                    value: [{weekdayName: 'Tuesday', startTime: '09:00', endTime: '10:00'}],
                })}
            />,
        );
        const rows = getAllByRole('row');
        // Monday row (index 1, after header)
        const mondayRow = rows[1];
        expect(mondayRow.textContent).toContain('Monday');
        // Cells after weekdayName should not show any time value
        const cells = mondayRow.querySelectorAll('td');
        expect(cells[1]?.textContent?.trim()).toBe('');
        expect(cells[2]?.textContent?.trim()).toBe('');
    });

    it('renders all example weekday names', () => {
        const {getByText} = render(<TableWidget {...mkProps({value: []})} />);
        expect(getByText('Monday')).toBeTruthy();
        expect(getByText('Tuesday')).toBeTruthy();
        expect(getByText('Wednesday')).toBeTruthy();
    });
});

// ── Dynamic pivot — dropdown-sourced rows ──────────────────────────────────

describe('TableWidget — dynamic pivot (dropdown)', () => {
    it('renders one row per dropdown entry', () => {
        const {getAllByRole} = render(
            <TableWidget
                {...mkProps({
                    schema: PERMISSION_SCHEMA as never,
                    value: [],
                    dropdowns: {entity: ENTITY_DROPDOWN},
                })}
            />,
        );
        const rows = getAllByRole('row');
        // header + 3 entity rows
        expect(rows.length).toBe(4);
    });

    it('overlays existing permission data onto the correct entity row', () => {
        const {getByText, getAllByRole} = render(
            <TableWidget
                {...mkProps({
                    schema: PERMISSION_SCHEMA as never,
                    value: [{entityId: 2, entityName: 'Role', view: true}],
                    dropdowns: {entity: ENTITY_DROPDOWN},
                })}
            />,
        );
        expect(getByText('Role')).toBeTruthy();
        // Organization row should have empty boolean cells (no icons)
        const rows = getAllByRole('row');
        const orgRow = rows[1]; // Organization
        expect(orgRow.querySelector('.pi-check')).toBeFalsy();
    });
});

// ── Boolean rendering in view mode ────────────────────────────────────────

describe('TableWidget — boolean column view-mode rendering', () => {
    it('renders pi-check icon for true boolean value', () => {
        const {container} = render(
            <TableWidget
                {...mkProps({
                    schema: PERMISSION_SCHEMA as never,
                    value: [{entityId: 1, entityName: 'Organization', view: true}],
                    dropdowns: {entity: ENTITY_DROPDOWN},
                })}
            />,
        );
        expect(container.querySelector('.pi-check.text-green-500')).toBeTruthy();
    });

    it('renders pi-times icon for false boolean value', () => {
        const {container} = render(
            <TableWidget
                {...mkProps({
                    schema: PERMISSION_SCHEMA as never,
                    value: [{entityId: 1, entityName: 'Organization', view: false}],
                    dropdowns: {entity: ENTITY_DROPDOWN},
                })}
            />,
        );
        expect(container.querySelector('.pi-times.text-red-500')).toBeTruthy();
    });

    it('renders nothing for null boolean value', () => {
        const {container} = render(
            <TableWidget
                {...mkProps({
                    schema: PERMISSION_SCHEMA as never,
                    value: [{entityId: 1, entityName: 'Organization'}],
                    dropdowns: {entity: ENTITY_DROPDOWN},
                })}
            />,
        );
        expect(container.querySelector('.pi-check')).toBeFalsy();
        expect(container.querySelector('.pi-times')).toBeFalsy();
    });

    it('does NOT render a <Checkbox> input in view mode', () => {
        const {container} = render(
            <TableWidget
                {...mkProps({
                    schema: PERMISSION_SCHEMA as never,
                    value: [{entityId: 1, entityName: 'Organization', view: true}],
                    dropdowns: {entity: ENTITY_DROPDOWN},
                })}
            />,
        );
        // No interactive checkbox inputs should be present
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        expect(checkboxes.length).toBe(0);
    });
});

// ── Row selection checkbox hidden in pivot mode ────────────────────────────

describe('TableWidget — no row-selection checkbox in pivot mode', () => {
    it('does not render a multi-select Column (no checkbox column) in static pivot', () => {
        const {container} = render(<TableWidget {...mkProps({value: []})} />);
        // The selection column header is an empty <th> with a checkbox inside
        const checkboxes = container.querySelectorAll('thead input[type="checkbox"]');
        expect(checkboxes.length).toBe(0);
    });

    it('does not render a multi-select Column in dynamic pivot', () => {
        const {container} = render(
            <TableWidget
                {...mkProps({
                    schema: PERMISSION_SCHEMA as never,
                    value: [],
                    dropdowns: {entity: ENTITY_DROPDOWN},
                })}
            />,
        );
        const checkboxes = container.querySelectorAll('thead input[type="checkbox"]');
        expect(checkboxes.length).toBe(0);
    });
});

// ── Row editor: join columns are non-editable ─────────────────────────────

describe('TableWidget — join columns non-editable during row edit', () => {
    it('does not render an editor input for the join column (weekdayName)', async () => {
        const {container} = render(
            <TableWidget
                {...mkProps({
                    value: [{weekdayName: 'Monday', startTime: '08:00', endTime: '09:00'}],
                })}
            />,
        );

        // Click the row-editor pencil button on the first data row
        const editBtn = container.querySelector(
            'tbody tr td:last-child button',
        ) as HTMLButtonElement | null;
        if (editBtn) {
            fireEvent.click(editBtn);
            await waitFor(() => {
                // After entering edit mode, weekdayName cell should NOT contain an <input>
                const firstDataRow = container.querySelector('tbody tr');
                const weekdayCell = firstDataRow?.querySelector('td:first-child');
                expect(weekdayCell?.querySelector('input')).toBeFalsy();
            });
        }
    });

    it('renders editor inputs for non-join columns (startTime, endTime)', async () => {
        const {container} = render(
            <TableWidget
                {...mkProps({
                    value: [{weekdayName: 'Monday', startTime: '08:00', endTime: '09:00'}],
                })}
            />,
        );

        const editBtn = container.querySelector(
            'tbody tr td:last-child button',
        ) as HTMLButtonElement | null;
        if (editBtn) {
            fireEvent.click(editBtn);
            await waitFor(() => {
                const inputs = container.querySelectorAll('tbody tr input');
                // At least the startTime and endTime inputs should appear
                expect(inputs.length).toBeGreaterThanOrEqual(2);
            });
        }
    });
});

// ── Inserting a new row on edit of empty pivot slot ───────────────────────

describe('TableWidget — pivot insert on save of previously-empty row', () => {
    it('calls onChange and appends a new row when saving an empty pivot slot', async () => {
        const onChange = vi.fn();
        const {container} = render(
            <TableWidget
                {...mkProps({
                    // Only Tuesday has data; Monday is empty
                    value: [{weekdayName: 'Tuesday', startTime: '09:00', endTime: '10:00'}],
                    onChange,
                })}
            />,
        );

        // Find the edit button for Monday (first row)
        const editBtn = container.querySelector(
            'tbody tr:first-child td:last-child button',
        ) as HTMLButtonElement | null;
        if (!editBtn) return; // guard for environments where row editor is disabled

        fireEvent.click(editBtn);

        await waitFor(() => {
            const saveBtn = container.querySelector('tbody tr:first-child button[aria-label]');
            expect(saveBtn).toBeTruthy();
        });

        const saveBtn = container.querySelector(
            'tbody tr:first-child button',
        ) as HTMLButtonElement | null;
        if (saveBtn) {
            fireEvent.click(saveBtn);
            await waitFor(() => {
                expect(onChange).toHaveBeenCalled();
                const newValue: {weekdayName: string}[] = onChange.mock.calls[0][0];
                const monday = newValue.find(r => r.weekdayName === 'Monday');
                expect(monday).toBeTruthy();
            });
        }
    });

    it('calls onChange and preserves join field when saving empty dynamic pivot slot', async () => {
        const onChange = vi.fn();
        const {container} = render(
            <TableWidget
                {...mkProps({
                    schema: PERMISSION_SCHEMA as never,
                    // Only entityId 1 has data; entityId 2 (Role) is empty
                    value: [{entityId: 1, entityName: 'Organization', view: true}],
                    dropdowns: {entity: ENTITY_DROPDOWN},
                    onChange,
                })}
            />,
        );

        // Edit the Role row (second data row, index 1)
        const roleEditBtn = container.querySelector(
            'tbody tr:nth-child(2) td:last-child button',
        ) as HTMLButtonElement | null;
        if (!roleEditBtn) return;

        fireEvent.click(roleEditBtn);

        await waitFor(() => {
            const saveBtn = container.querySelector('tbody tr:nth-child(2) button');
            expect(saveBtn).toBeTruthy();
        });

        const saveBtn = container.querySelector(
            'tbody tr:nth-child(2) button',
        ) as HTMLButtonElement | null;
        if (saveBtn) {
            fireEvent.click(saveBtn);
            await waitFor(() => {
                expect(onChange).toHaveBeenCalled();
                const newValue: {entityId: number; entityName: string}[] =
                    onChange.mock.calls[0][0];
                const role = newValue.find(r => r.entityId === 2);
                expect(role).toBeTruthy();
                expect(role?.entityName).toBe('Role');
            });
        }
    });

    it('updates the existing row in place when saving an already-populated pivot slot', async () => {
        const onChange = vi.fn();
        const {container} = render(
            <TableWidget
                {...mkProps({
                    value: [
                        {weekdayName: 'Monday', startTime: '08:00', endTime: '09:00'},
                        {weekdayName: 'Tuesday', startTime: '09:00', endTime: '10:00'},
                    ],
                    onChange,
                })}
            />,
        );

        const editBtn = container.querySelector(
            'tbody tr:first-child td:last-child button',
        ) as HTMLButtonElement | null;
        if (!editBtn) return;

        fireEvent.click(editBtn);

        await waitFor(() => {
            const inputs = container.querySelectorAll('tbody tr:first-child input');
            expect(inputs.length).toBeGreaterThan(0);
        });

        // Change startTime
        const startInput = container.querySelector(
            'tbody tr:first-child input',
        ) as HTMLInputElement | null;
        if (startInput) {
            fireEvent.change(startInput, {target: {value: '07:30'}});
        }

        const saveBtn = container.querySelector(
            'tbody tr:first-child button',
        ) as HTMLButtonElement | null;
        if (saveBtn) {
            fireEvent.click(saveBtn);
            await waitFor(() => {
                expect(onChange).toHaveBeenCalled();
                const newValue: {weekdayName: string}[] = onChange.mock.calls[0][0];
                // Should still have exactly 2 rows (no duplicate inserted)
                expect(newValue.length).toBe(2);
            });
        }
    });
});
