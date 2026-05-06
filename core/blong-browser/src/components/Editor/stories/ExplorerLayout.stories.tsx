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
 *  - TableWidget with `widget.toolbar` for selection-aware action buttons
 *  - Master-detail / cascaded wiring via `widget.parent`, `widget.master`,
 *    and `watch: '$.selected.tableName'` for the detail card
 *
 * These stories replace and supersede the Explorer.stories.tsx stories.
 */
import type {Meta} from '@storybook/react-vite';
import type {IWidgetConfig} from '../../../index.js';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/Explorer',
    component: Editor,
    parameters: {layout: 'fullscreen'},
};
export default meta;

// ── Shared column schema ──────────────────────────────────────────────────────

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
        toolbar: [
            {label: 'Create', icon: 'pi pi-plus', method: 'coralCoralAdd'},
            {
                label: 'Edit',
                icon: 'pi pi-pencil',
                enabled: 'current',
                method: 'coralCoralEdit',
            },
            {
                label: 'Delete',
                icon: 'pi pi-trash',
                enabled: 'selected',
                confirm: 'Delete selected corals?',
                method: 'coralCoralDelete',
            },
        ],
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
 * Demonstrates the most common Explorer pattern: listAction + toolbar buttons.
 */
export const Default: StoryFn = () => (
    <Editor
        schema={{properties: {coral: coralTableField}}}
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
 */
export const WithDetails: StoryFn = () => (
    <Editor
        schema={{properties: {coral: coralTableField}}}
        cards={{
            table: {label: '', widgets: ['coral']},
            detail: {
                label: 'Coral Details',
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
            },
        }}
        editable={true}
        editMode={false}
    />
);

WithDetails.play = async ({canvas, userEvent}) => {
    const row = await canvas.findByText('Brain Coral');
    await userEvent.click(row);
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
                    title: 'Categories',
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
                // Table widget — cascaded from navigator selection
                coral: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        listAction: 'coralCoralFind',
                        keyField: 'id',
                        selectionMode: 'single',
                        columns: ['speciesName', 'coralType', 'maxDepth'],
                        // Cascade from navigator: filter corals by the selected category
                        parent: '$.selected.category',
                        master: {categoryId: 'id'},
                        toolbar: [
                            {label: 'Create', icon: 'pi pi-plus', method: 'coralCoralAdd'},
                            {
                                label: 'Edit',
                                icon: 'pi pi-pencil',
                                enabled: 'current' as const,
                                method: 'coralCoralEdit',
                            },
                        ],
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
        cards={{
            nav: {label: 'Categories', widgets: ['category']},
            table: {label: '', widgets: ['coral']},
            detail: {
                label: 'Coral Details',
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
            },
        }}
        editable={false}
        editMode={false}
    />
);

// ── TabbedExplorer — tabs instead of split layout ─────────────────────────────

/**
 * TabbedExplorer — the same coral data presented in a tabs layout instead of
 * a split layout. Demonstrates that the Editor's layout system lets you switch
 * between split and tabs without changing any business logic.
 */
export const TabbedExplorer: StoryFn = () => (
    <Editor
        schema={{properties: {coral: coralTableField}}}
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
        cards={{
            table: {label: '', widgets: ['coral']},
            detail: {
                label: 'Details',
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
            },
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
            cards={{
                table: {
                    label: 'Coral List',
                    className: 'col-12 md:col-7',
                    widgets: ['coral'],
                },
                detail: {
                    label: 'Details',
                    className: 'col-12 md:col-5',
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
