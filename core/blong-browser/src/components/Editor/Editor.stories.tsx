/**
 * Editor stories — blong-browser adaptation
 *
 * Mapping notes:
 * - target `onGet` / `onDropdown` / `methods` → blong-browser `loadAction` + `dispatch` context
 * - target `object: 'tree'` with nested schema → blong-browser flat schema (see fixtures/tree.ts)
 * - target Template uses Redux + useToast → blong-browser uses `dispatch` vi.fn() in tests
 */
import type {Meta} from '@storybook/react';
import {within} from '@testing-library/react';
import {userEvent} from '@testing-library/user-event';
import React from 'react';
import {treeDropdownData, treeValue} from '../../../.storybook/dispatch.js';
import {Card} from '../Card/index.js';
import {Explorer} from '../Explorer/index.js';
import tree from './fixtures/tree.js';
import type {IEditorProps} from './index.js';
import {Editor} from './index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor',
    component: Editor,
};
export default meta;

export type StoryArgs = Partial<IEditorProps>;
export type StoryFn = ((args: StoryArgs) => React.ReactElement) & {
    args?: StoryArgs;
    play?: (ctx: {canvasElement: HTMLElement}) => Promise<void>;
    decorators?: Array<(Story: React.ComponentType) => React.ReactElement>;
};

export const Basic: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        value={treeValue}
        saveAction="treeTreeEdit"
        editable
        editMode
        layout="edit"
        layouts={{
            edit: [
                ['edit', 'denied'],
                ['taxonomy', 'reproduction'],
                ['morphology', 'links'],
                'habitat',
            ],
        }}
        dropdowns={treeDropdownData}
        designable
        {...args}
    />
);
Basic.args = {};

/**
 * Shared template — tree schema + save wired; stories spread their args on top.
 * Sub-story files import this to use `Template.bind({})` + `.args` instead of
 * duplicating the JSX
 */
export const Template: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        saveAction="treeTreeEdit"
        editable
        layout="edit"
        layouts={{
            edit: [
                ['edit', 'denied'],
                ['taxonomy', 'reproduction'],
                ['morphology', 'links'],
                'habitat',
            ],
        }}
        {...args}
    />
);
Template.args = {};

/** Loading — shows per-field skeleton; `treeTreeLoad` never resolves so loading state persists */
export const Loading: StoryFn = Template.bind({});
Loading.args = {loadAction: 'treeTreeLoad', editMode: true};

/** GetError — load rejects (e.g. unauthenticated); `treeTreeGetError` resolves with an error */
export const GetError: StoryFn = Template.bind({});
GetError.args = {loadAction: 'treeTreeGetError', editMode: true};

/**
 * DropdownError — dropdown loading rejects.
 * Uses `dropdown: 'tree.typeError'` / `'tree.habitatError'` widget keys so
 * `portal.dropdown.list` receives an Error-suffixed name and rejects.
 */
export const DropdownError: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        schema={{
            ...tree.schema,
            properties: {
                ...tree.schema.properties,
                treeType: {
                    ...(tree.schema.properties?.treeType ?? {}),
                    widget: {type: 'dropdown', dropdown: 'tree.typeError'},
                },
                habitat: {
                    ...(tree.schema.properties?.habitat ?? {}),
                    widget: {type: 'multiSelectPanel', dropdown: 'tree.habitatError'},
                },
            },
        }}
        loadAction="treeTreeGet"
        editMode
        layout="edit"
        layouts={{
            edit: [['edit', 'denied'], ['taxonomy', 'reproduction'], ['morphology'], 'habitat'],
        }}
        {...args}
    />
);
DropdownError.args = {};

/**
 * Design mode — cards show drag-handle grips; reorder by dragging.
 * Starts with the design toggle already active so the handles are immediately visible.
 */
export const Design: StoryFn = Template.bind({});
Design.args = {
    loadAction: 'treeTreeGet',
    editMode: true,
    designable: true,
    initialDesignMode: true,
};

/** Tabbed layout */
export const Tabs: StoryFn = Template.bind({});
Tabs.args = {
    loadAction: 'treeTreeGet',
    layouts: {
        edit: {
            orientation: 'top',
            items: [
                {id: 'general', icon: 'pi pi-user', label: 'General', widgets: ['edit', 'habitat']},
                {
                    id: 'details',
                    label: 'Details',
                    icon: 'pi pi-book',
                    widgets: ['taxonomy', 'morphology'],
                },
                {id: 'history', icon: 'pi pi-clock', widgets: ['history']},
            ],
        },
    },
};

/** Submit — flat layout, save interaction */
export const Submit: StoryFn = Template.bind({});
Submit.args = {
    loadAction: 'treeTreeGet',
    editMode: true,
    layouts: {
        edit: [
            ['edit', 'denied'],
            ['taxonomy', 'reproduction'],
            ['morphology'],
            ['habitat', 'system'],
        ],
    },
};
Submit.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const descInput = canvas.queryByLabelText?.('Description') as HTMLTextAreaElement | null;
    if (descInput) await userEvent.type(descInput, 'test');
    const saveBtn = canvas.queryByText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) await userEvent.click(saveBtn);
};

/** Server-side validation errors shown in form fields */
export const ServerValidation: StoryFn = Template.bind({});
ServerValidation.args = {
    loadAction: 'treeTreeGet',
    editMode: true,
    saveAction: 'treeTreeEditError',
};
ServerValidation.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 200));
    // Make the form dirty so the Save button becomes enabled
    const nameInput = canvas.getByRole('textbox', {name: /name/i});
    await userEvent.tripleClick(nameInput);
    await userEvent.type(nameInput, 'Test');
    const saveBtn = canvas.getByRole('button', {name: 'Save'});
    await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 500));
};

/** Toolbar — custom buttons on the right side */
export const Toolbar: StoryFn = Template.bind({});
Toolbar.args = {
    loadAction: 'treeTreeGet',
    toolbarRight: [
        {label: 'Browse', icon: 'pi pi-list', action: 'browseAction'},
        {label: 'Open', icon: 'pi pi-folder-open', action: 'openAction'},
    ],
};

/** Files — stub; imageUpload/ocr/webcamera widgets not yet implemented in blong-browser. */
export const Files: StoryFn = Template.bind({});
Files.args = {loadAction: 'treeTreeGet', editMode: true, layouts: {edit: ['edit']}};
Files.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const saveBtn = canvas.queryByText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 500));
};

/** FilesInTab — file widget in a tab (stub). */
export const FilesInTab: StoryFn = Template.bind({});
FilesInTab.args = {
    loadAction: 'treeTreeGet',
    editMode: true,
    layouts: {
        edit: {
            orientation: 'top',
            items: [
                {id: 'general', icon: 'pi pi-user', label: 'General', widgets: ['edit', 'habitat']},
                {id: 'details', label: 'Details', icon: 'pi pi-book', widgets: ['edit']},
            ],
        },
    },
};
FilesInTab.play = Files.play;

const stepsItems = [
    {id: 'general', label: 'General', widgets: ['edit', 'habitat']},
    {id: 'details', label: 'Details', widgets: ['taxonomy', 'morphology']},
    {id: 'history', label: 'History', widgets: ['history']},
];
const stepsLayout = {orientation: 'top' as const, type: 'steps' as const, items: stepsItems};

export const Steps: StoryFn = Template.bind({});
Steps.args = {loadAction: 'treeTreeGet', editable: false, layouts: {edit: stepsLayout}};

/** Steps with back disabled (stub — disableBack not yet in ITabLayoutConfig). */
export const StepsDisabledBack: StoryFn = Template.bind({});
StepsDisabledBack.args = {...Steps.args};
StepsDisabledBack.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const nextBtn = canvas.queryByText?.('Next') as HTMLButtonElement | null;
    if (nextBtn) await userEvent.click(nextBtn);
};

/** Steps with back hidden (stub — hideBack not yet in ITabLayoutConfig). */
export const StepsHiddenBack: StoryFn = Template.bind({});
StepsHiddenBack.args = {...Steps.args};
StepsHiddenBack.play = StepsDisabledBack.play;

/** ExplorerTab — Explorer configured for the tree history tab */
function ExplorerTab() {
    return (
        <Card id="card-history">
            <Explorer
                columns={[
                    {field: 'treeName', header: 'Name'},
                    {field: 'habitat', header: 'Habitat'},
                    {field: 'kingdom', header: 'Kingdom'},
                ]}
                listAction="treeTreeFind"
            />
        </Card>
    );
}

/** EditorWithExplorer — one tab contains an Explorer component (history tab). */
export const EditorWithExplorer: StoryFn = Template.bind({});
EditorWithExplorer.args = {
    loadAction: 'treeTreeGet',
    layouts: {
        edit: {
            orientation: 'top',
            items: [
                {id: 'general', icon: 'pi pi-user', label: 'General', widgets: ['edit', 'habitat']},
                {
                    id: 'details',
                    label: 'Details',
                    icon: 'pi pi-book',
                    widgets: ['taxonomy', 'morphology'],
                },
                {
                    id: 'history',
                    icon: 'pi pi-clock',
                    label: 'History',
                    widgets: [],
                    component: ExplorerTab,
                },
            ],
        },
    },
};
EditorWithExplorer.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const historyTab = canvas.queryByText?.('History');
    if (historyTab) await userEvent.click(historyTab);
};
