import type {Meta, StoryObj} from '@storybook/react-vite';
import React from 'react';
import {useAppStore} from '../../state/appStore.js';
import {Explorer} from './index.js';

const meta: Meta<typeof Explorer> = {
    title: 'Data/Explorer',
    component: Explorer,
    tags: ['autodocs'],
    parameters: {layout: 'fullscreen'},
};
export default meta;

type Story = StoryObj<typeof Explorer>;

// ── Shared columns ─────────────────────────────────────────────────────────

const columns = [
    {field: 'speciesName', header: 'Species Name', sortable: true},
    {field: 'coralType', header: 'Type', sortable: true},
    {field: 'maxDepth', header: 'Max Depth', sortable: true},
    {field: 'endangered', header: 'Endangered', sortable: false},
];

// ── Shared toolbar ─────────────────────────────────────────────────────────

const toolbar = [
    {
        label: 'Create',
        icon: 'pi pi-plus',
        method: 'coralCoralAdd',
    },
    {
        label: 'Edit',
        icon: 'pi pi-pencil',
        enabled: 'current' as const,
        method: 'coralCoralEdit',
    },
    {
        label: 'Delete',
        icon: 'pi pi-trash',
        enabled: 'selected' as const,
        confirm: 'Do you want to delete the selected corals?',
        method: 'coralCoralDelete',
    },
];

// ── Stories ────────────────────────────────────────────────────────────────

/** Default — full-featured coral list with toolbar and pagination. */
export const Default: Story = {
    args: {
        columns,
        listAction: 'coralCoralFind',
        selectionMode: 'multiple',
        toolbar,
    },
};

/** Loading — `listAction` never resolves; skeleton / loading state persists. */
export const Loading: Story = {
    args: {
        ...Default.args,
        listAction: 'coralCoralLoad',
    },
};

/** GetError — list fetch rejects; global error dialog appears. */
export const GetError: Story = {
    args: {
        ...Default.args,
        listAction: 'coralCoralFindError',
    },
};

/**
 * ActionPermissions — Create/Delete are forbidden; Edit is granted.
 * Demonstrates permission-aware toolbar button visibility.
 */
export const ActionPermissions: Story = {
    decorators: [
        (Story: React.ComponentType) => {
            React.useEffect(() => {
                useAppStore.getState().setPermissions({granted: true, forbidden: false});
                return () => useAppStore.getState().setPermissions({});
            }, []);
            return <Story />;
        },
    ],
    args: {
        ...Default.args,
        toolbar: [
            {label: 'Create', icon: 'pi pi-plus', permission: 'forbidden', method: 'coralCoralAdd'},
            {
                label: 'Edit',
                icon: 'pi pi-pencil',
                permission: 'granted',
                enabled: 'current' as const,
                method: 'coralCoralEdit',
            },
            {
                label: 'Delete',
                icon: 'pi pi-trash',
                permission: 'forbidden',
                enabled: 'selected' as const,
                method: 'coralCoralDelete',
            },
        ],
    },
};

/**
 * Details — side panel shows the currently selected coral's fields and total
 * record count.  Click a row to populate the panel.
 */
export const Details: Story = {
    args: {
        ...Default.args,
        selectionMode: 'single',
        details: (row, total) => (
            <div style={{padding: '0.25rem'}}>
                <div
                    style={{
                        marginBottom: '0.5rem',
                        color: 'var(--text-color-secondary)',
                        fontSize: '0.75rem',
                    }}
                >
                    Records: {total ?? 0}
                </div>
                {row ? (
                    <>
                        <div>
                            <strong>Species:</strong> {String(row.speciesName ?? '')}
                        </div>
                        <div>
                            <strong>Type:</strong> {String(row.coralType ?? '')}
                        </div>
                        <div>
                            <strong>Max Depth:</strong> {String(row.maxDepth ?? '')}m
                        </div>
                        <div>
                            <strong>Endangered:</strong> {row.endangered ? 'Yes' : 'No'}
                        </div>
                    </>
                ) : (
                    <div style={{color: 'var(--text-color-secondary)'}}>Select a row</div>
                )}
            </div>
        ),
    },
};

/**
 * Children — a custom navigation panel rendered to the left of the table.
 * Demonstrates the `children` left-panel prop.
 */
export const Children: Story = {
    args: {
        ...Default.args,
        children: (
            <div style={{padding: '0.75rem'}}>
                <strong>Filter by type</strong>
                <ul style={{margin: '0.5rem 0 0', padding: '0 0 0 1rem'}}>
                    {['All', 'Hard', 'Soft', 'Black', 'Fire'].map(t => (
                        <li
                            key={t}
                            style={{cursor: 'pointer', padding: '0.25rem 0'}}
                        >
                            {t}
                        </li>
                    ))}
                </ul>
            </div>
        ),
    },
};

/**
 * Grid — DataView card layout; useful for image-heavy or rich-content rows.
 * Mirrors ut-prime Explorer `Grid` story.
 */
export const Grid: Story = {
    args: {
        ...Default.args,
        layout: 'grid',
        selectionMode: 'none',
    },
};

/**
 * GridFlex — compact horizontal cards (icon + fields side by side).
 * Mirrors ut-prime Explorer `GridFlex` story — 4 cards per row on desktop.
 */
export const GridFlex: Story = {
    args: {
        ...Default.args,
        layout: 'grid',
        selectionMode: 'none',
        pageSize: 25,
        cardTemplate: row => (
            <div className="col-6 md:col-3">
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        border: '1px solid var(--surface-border)',
                        borderRadius: 'var(--border-radius)',
                        padding: '0.5rem 0.75rem',
                        margin: '0.25rem',
                        background: 'var(--surface-card)',
                        cursor: 'pointer',
                    }}
                >
                    <i
                        className="pi pi-paperclip"
                        style={{color: 'var(--text-color-secondary)'}}
                    />
                    <span style={{flex: 1, fontSize: '0.875rem', fontWeight: 600}}>
                        {String(row.speciesName ?? '')}
                    </span>
                    <span style={{fontSize: '0.875rem', color: 'var(--text-color-secondary)'}}>
                        {String(row.coralType ?? '')}
                    </span>
                </div>
            </div>
        ),
    },
};

/**
 * WithStaticData — inline render with explicit columns and toolbar.
 * Useful for snapshot tests and design validation.
 */
export const WithStaticData: Story = {
    render: () => (
        <div style={{height: 500}}>
            <Explorer
                columns={columns}
                listAction="coralCoralFind"
                selectionMode="multiple"
                toolbar={toolbar}
                onSelectionChange={v => console.log('selected', v)}
            />
        </div>
    ),
};

// ── Submit ─────────────────────────────────────────────────────────────────
// Mirrors ut-prime's Submit story.
// Demonstrates:
//   • ${id}            — passes the keyField value of the current row
//   • ${current}       — passes the entire current row
//   • ${selected}      — passes all selected rows
//   • ${current.field} — passes a single field from the current row
//   • successHint      — shows an overlay next to the button after success
//   • column action    — Species Name cells render as clickable links
//   • filter row       — inline filter inputs below the column headers

const submitColumns = [
    {
        field: 'speciesName',
        header: 'Species Name',
        sortable: true,
        filterable: true,
        action: 'coralCoralOpen',
    },
    {field: 'coralType', header: 'Type', sortable: true, filterable: true},
    {field: 'maxDepth', header: 'Max Depth', sortable: true, filterable: true},
    {field: 'endangered', header: 'Endangered', sortable: false},
];

/**
 * Submit — demonstrates ${id}, ${current}, ${selected}, ${current.field} template
 * resolution in toolbar button params, column-link actions, and the successHint overlay.
 *
 * Click a row to select it, then use the toolbar buttons:
 * — **Submit id**: sends `{id: row.id}` to `coralCoralSubmit`
 * — **Submit current**: sends the full row to `coralCoralSubmit`
 * — **Submit selected**: sends the selected rows array to `coralCoralSubmit`
 * — **Submit template**: sends `{id, maxDepth}` derived from the current row
 * — **Error**: always callable; triggers a server-side error toast
 * — **Delay**: 1.5 s delay then shows a "Done" hint overlay on the button
 *
 * The **Species Name** column renders as a link — clicking it fires `coralCoralOpen`
 * with the full row, and the result is shown in the Storybook toast.
 */
export const Submit: Story = {
    args: {
        columns: submitColumns,
        listAction: 'coralCoralFind',
        selectionMode: 'multiple',
        keyField: 'id',
        toolbar: [
            {
                label: 'Submit id',
                icon: 'pi pi-send',
                enabled: 'current',
                method: 'coralCoralSubmit',
                params: '${id}',
            },
            {
                label: 'Submit current',
                icon: 'pi pi-inbox',
                enabled: 'current',
                method: 'coralCoralSubmit',
                params: '${current}',
            },
            {
                label: 'Submit selected',
                icon: 'pi pi-list',
                enabled: 'selected',
                method: 'coralCoralSubmit',
                params: '${selected}',
            },
            {
                label: 'Submit template',
                icon: 'pi pi-file-export',
                enabled: 'current',
                method: 'coralCoralSubmit',
                params: {id: '${id}', maxDepth: '${current.maxDepth}'},
            },
            {
                label: 'Error',
                icon: 'pi pi-exclamation-circle',
                method: 'coralCoralSubmitError',
                params: {},
            },
            {
                label: 'Delay',
                icon: 'pi pi-clock',
                method: 'coralCoralSubmitDelay',
                successHint: 'Done',
                params: {},
            },
        ],
    },
};
