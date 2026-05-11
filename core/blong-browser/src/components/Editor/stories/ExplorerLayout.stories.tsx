/**
 * Editor-based Explorer — demonstrates how the Explorer pattern is achieved
 * using the Editor/Form/Deck/Card/Widget architecture.
 *
 * The Explorer functionality is expressed through:
 *  - Editor as the top-level shell (toolbar, load/save lifecycle, design mode)
 *  - Split layout (`type: 'split'`) for side-by-side panels
 *  - NavigatorWidget (`widget.type: 'navigator'`) for the navigation tree
 *  - TableWidget with `widget.listAction` for server-side data loading,
 *    pagination, search and sort
 *  - Action buttons on the **Editor toolbar** (not the table widget) so they
 *    appear in the unified top bar; `enabled: 'current' | 'selected'` and
 *    `${id}` / `${current}` template params are resolved from the selected row
 *  - Master-detail / cascaded wiring via `watch: '$.selected.tableName'` for
 *    the detail card — the detail card reads directly from the selected row so
 *    it works even in listAction mode where the form has no server data
 *
 * These stories replace and supersede the Explorer.stories.tsx stories.
 */
import type {Meta} from '@storybook/react-vite';
import type {ISplitLayoutConfig} from '../../../hooks/useLayout.js';
import type {IWidgetConfig} from '../../../index.js';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/Explorer',
    component: Editor,
    parameters: {layout: 'fullscreen'},
};
export default meta;

// ── Shared toolbar buttons (placed on Editor, not widget) ─────────────────────

const coralToolbar = [
    {label: 'Create', icon: 'pi pi-plus', method: 'coralCoralAdd'},
    {
        label: 'Edit',
        icon: 'pi pi-pencil',
        enabled: 'current' as const,
        method: 'coralCoralEdit',
        params: '${current}',
    },
    {
        label: 'Delete',
        icon: 'pi pi-trash',
        enabled: 'selected' as const,
        confirm: 'Delete selected corals?',
        method: 'coralCoralDelete',
        params: {id: '${id}'},
    },
];

// ── Shared column schema (no widget-level toolbar) ────────────────────────────

const coralTableField = {
    title: '',
    type: 'array',
    widget: {
        type: 'table',
        listAction: 'coralCoralFind',
        resultSet: 'items',
        keyField: 'id',
        selectionMode: 'single',
        columns: ['speciesName', 'coralType', 'maxDepth', 'endangered'],
    } as IWidgetConfig,
    items: {
        properties: {
            id: {title: 'ID', readOnly: true},
            speciesName: {title: 'Species Name'},
            coralType: {title: 'Type'},
            maxDepth: {title: 'Max Depth'},
            endangered: {title: 'Endangered', type: 'boolean'},
        },
    },
};

// ── Default — table only, no nav, no details ──────────────────────────────────

/**
 * Default — a single table card that loads coral list from the server.
 * Action buttons (Create / Edit / Delete) live on the Editor toolbar.
 * Edit and Delete are disabled until a row is selected.
 */
export const Default: StoryFn = () => (
    <Editor
        schema={{properties: {coral: coralTableField}}}
        toolbar={coralToolbar}
        cards={{
            table: {label: '', widgets: ['coral']},
        }}
        layout="edit"
        layouts={{
            edit: ['table'],
        }}
        editable={false}
        editMode={false}
    />
);

// ── WithDetails — table + side details panel ──────────────────────────────────

/**
 * WithDetails — selecting a row populates an editable detail card on the right.
 * Uses the master-detail pattern via `watch: '$.selected.coral'`.
 * The detail card fields are populated directly from the selected row even though
 * the table loads data via `listAction` (the form has no server data of its own).
 * Action buttons in the Editor toolbar are enabled/disabled based on selection.
 */
export const WithDetails: StoryFn = () => (
    <Editor
        schema={{properties: {coral: coralTableField}}}
        toolbar={coralToolbar}
        cards={{
            table: {label: '', widgets: ['coral']},
            detail: {
                label: 'Coral Details',
                readOnly: true,
                watch: '$.selected.coral',
                widgets: [
                    '$.edit.coral.speciesName',
                    '$.edit.coral.coralType',
                    '$.edit.coral.maxDepth',
                    '$.edit.coral.endangered',
                ],
            },
        }}
        layout="edit"
        layouts={{
            edit: {
                type: 'split',
                panels: [
                    {size: 65, minSize: 30, cards: ['table']},
                    {size: 35, minSize: 20, cards: ['detail']},
                ],
            } as ISplitLayoutConfig,
        }}
        editable={false}
        editMode={false}
    />
);

WithDetails.play = async ({canvas, userEvent}) => {
    const row = await canvas.findAllByText('Pillar Coral');
    await userEvent.click(row[0]);
    await new Promise(r => setTimeout(r, 200));
};

// ── WithNavigator — navigator + table + details ───────────────────────────────

/**
 * WithNavigator — full three-panel Explorer layout using split layout.
 * Left panel: NavigatorWidget (tree filtered by parentId).
 * Centre panel: TableWidget with listAction, cascaded from navigator selection.
 * Right panel: Detail card showing selected row fields.
 */
export const WithNavigator: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                // Navigator widget — tree nav
                category: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'navigator',
                        listAction: 'coralCategoryFind',
                        keyField: 'id',
                        parentField: 'parentId',
                        labelField: 'name',
                    },
                    items: {
                        properties: {
                            id: {title: 'ID'},
                            parentId: {title: 'Parent'},
                            name: {title: 'Name'},
                        },
                    },
                },
                // Table widget — cascaded from navigator selection; no widget-level toolbar
                coral: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        listAction: 'coralCoralFind',
                        keyField: 'id',
                        selectionMode: 'single',
                        columns: ['speciesName', 'coralType', 'maxDepth'],
                        parent: '$.selected.category',
                        master: {categoryId: 'id'},
                    },
                    items: {
                        properties: {
                            id: {title: 'ID'},
                            categoryId: {title: 'Category', readOnly: true},
                            speciesName: {title: 'Species'},
                            coralType: {title: 'Type'},
                            maxDepth: {title: 'Max Depth'},
                        },
                    },
                },
            },
        }}
        // Toolbar on Editor — enabled/disabled state driven by coral row selection
        toolbar={coralToolbar}
        cards={{
            nav: {label: 'Categories', widgets: ['category']},
            table: {label: '', widgets: ['coral']},
            detail: {
                label: 'Coral Details',
                readOnly: true,
                watch: '$.selected.coral',
                widgets: [
                    '$.edit.coral.speciesName',
                    '$.edit.coral.coralType',
                    '$.edit.coral.maxDepth',
                ],
            },
        }}
        layout="edit"
        layouts={{
            edit: {
                type: 'split',
                panels: [
                    {size: 20, minSize: 10, cards: ['nav']},
                    {size: 50, minSize: 30, cards: ['table']},
                    {size: 30, minSize: 15, cards: ['detail']},
                ],
            } as ISplitLayoutConfig,
        }}
        editable={false}
        editMode={false}
    />
);

WithNavigator.play = async ({canvas, userEvent}) => {
    const family = await canvas.findAllByText('Shallow Reef');
    await userEvent.click(family[0]);
    await new Promise(r => setTimeout(r, 200));
    const row = await canvas.findAllByText('Table Coral');
    await userEvent.click(row[0]);
    await new Promise(r => setTimeout(r, 200));
};

// ── TabbedExplorer — tabs instead of split layout ─────────────────────────────

/**
 * TabbedExplorer — the same coral data presented in a tabs layout instead of
 * a split layout. Demonstrates that the Editor's layout system lets you switch
 * between split and tabs without changing any business logic.
 */
export const TabbedExplorer: StoryFn = () => (
    <Editor
        schema={{properties: {coral: coralTableField}}}
        toolbar={coralToolbar}
        cards={{
            table: {
                label: '',
                className: 'col-12',
                widgets: ['coral'],
            },
        }}
        layout="edit"
        layouts={{
            edit: {
                items: [
                    {
                        id: 'list',
                        label: 'Coral List',
                        icon: 'pi pi-table',
                        widgets: ['table'],
                    },
                ],
            },
        }}
        editable={false}
        editMode={false}
    />
);

// ── SplitVertical — vertical split (stacked) ──────────────────────────────────

/**
 * SplitVertical — toolbar + table on top; detail panel below.
 * Uses `orientation: 'vertical'` split layout.
 */
export const SplitVertical: StoryFn = () => (
    <Editor
        schema={{properties: {coral: coralTableField}}}
        toolbar={coralToolbar}
        cards={{
            table: {label: '', widgets: ['coral']},
            detail: {
                label: 'Details',
                readOnly: true,
                watch: '$.selected.coral',
                widgets: [
                    '$.edit.coral.speciesName',
                    '$.edit.coral.coralType',
                    '$.edit.coral.maxDepth',
                ],
            },
        }}
        layout="edit"
        layouts={{
            edit: {
                type: 'split',
                orientation: 'vertical',
                panels: [
                    {size: 60, cards: ['table']},
                    {size: 40, cards: ['detail']},
                ],
            } as ISplitLayoutConfig,
        }}
        editable={false}
        editMode={false}
    />
);

// ── Designable — Explorer with design mode ────────────────────────────────────

/**
 * Designable — click the cog icon in the toolbar to enter design mode.
 * Cards can be rearranged to customize the layout.
 */
export const Designable: StoryFn = () => (
    <div style={{height: 600, display: 'flex', flexDirection: 'column'}}>
        <Editor
            schema={{properties: {coral: coralTableField}}}
            toolbar={coralToolbar}
            cards={{
                table: {
                    label: 'Coral List',
                    className: 'col-12 md:col-7',
                    widgets: ['coral'],
                },
                detail: {
                    label: 'Details',
                    className: 'col-12 md:col-5',
                    readOnly: true,
                    watch: '$.selected.coral',
                    widgets: [
                        '$.edit.coral.speciesName',
                        '$.edit.coral.coralType',
                        '$.edit.coral.maxDepth',
                    ],
                },
            }}
            layout="edit"
            layouts={{edit: ['table', 'detail']}}
            designable
            editMode={false}
        />
    </div>
);
