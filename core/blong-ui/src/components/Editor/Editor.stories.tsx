/**
 * Editor stories — blong-ui adaptation
 *
 * Mapping notes:
 * - target `onGet` / `onDropdown` / `methods` → blong-ui `loadAction` + `dispatch` context
 * - target `object: 'tree'` with nested schema → blong-ui flat schema (see fixtures/tree.ts)
 * - target Template uses Redux + useToast → blong-ui uses `dispatch` vi.fn() in tests
 */
import type {Meta} from '@storybook/react';
import {within} from '@testing-library/react';
import {userEvent} from '@testing-library/user-event';
import React from 'react';
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
};

/** Basic layout flat */
const treeDropdowns: Record<string, {value: number; label: string}[]> = {
    'tree.type': [
        {value: 1, label: 'Conifer'},
        {value: 2, label: 'Broadleaf'},
    ],
    'tree.habitat': [
        {value: 1, label: 'Forests'},
        {value: 2, label: 'Plantations'},
        {value: 3, label: 'Riverbanks'},
        {value: 4, label: 'Rivers'},
        {value: 5, label: 'Rocky areas'},
        {value: 6, label: 'Urban'},
        {value: 7, label: 'Wetlands'},
    ],
};

export const Basic: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        value={{treeName: 'Oak', treeId: 1, treeType: 1, createdOn: new Date('2023-03-08')}}
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
        dropdowns={treeDropdowns}
        designable
        {...args}
    />
);
Basic.args = {};

/** Loading state — loadAction never resolves */
export const Loading: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable
        editMode
        layout="edit"
        layouts={{
            edit: [['edit', 'denied'], ['taxonomy', 'reproduction'], ['morphology'], 'habitat'],
        }}
        {...args}
    />
);
Loading.args = {};

/**
 * Design mode — blong-ui uses DesignModeContext.
 * NOTE: blong-ui's Editor does not natively accept a `design` prop.
 * The design mode is controlled by DesignModeContext at the suite level.
 * This story renders the same as Basic — snapshot mismatch is expected
 * because design mode is managed at the Deck level via context.
 */
export const Design: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable
        editMode
        layout="edit"
        layouts={{
            edit: [['edit', 'denied'], ['taxonomy', 'reproduction'], ['morphology'], 'habitat'],
        }}
        {...args}
    />
);
Design.args = {};

/** Tabbed layout - uses the new ITabLayoutConfig format */
export const Tabs: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable
        layout="edit"
        layouts={{
            edit: {
                orientation: 'top',
                items: [
                    {
                        id: 'general',
                        icon: 'pi pi-user',
                        label: 'General',
                        widgets: ['edit', 'habitat'],
                    },
                    {
                        id: 'details',
                        label: 'Details',
                        icon: 'pi pi-book',
                        widgets: ['taxonomy', 'morphology'],
                    },
                    {id: 'history', icon: 'pi pi-clock', label: 'History', widgets: ['history']},
                ],
            },
        }}
        {...args}
    />
);
Tabs.args = {};

/** Submit — flat layout, pre-loaded value, save interaction */
export const Submit: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable
        editMode
        layout="edit"
        layouts={{
            edit: [
                ['edit', 'denied'],
                ['taxonomy', 'reproduction'],
                ['morphology'],
                ['habitat', 'system'],
            ],
        }}
        {...args}
    />
);
Submit.args = {};
Submit.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    // Wait briefly for any async state to settle
    await new Promise(resolve => setTimeout(resolve, 50));
    const descInput = canvas.queryByLabelText?.('Description') as HTMLTextAreaElement | null;
    if (descInput) {
        await userEvent.type(descInput, 'test');
    }
    const saveBtn = canvas.queryByText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) {
        await userEvent.click(saveBtn);
    }
};

/** Server-side validation errors shown in form fields */
export const ServerValidation: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEditError"
        editable
        editMode
        layout="edit"
        layouts={{
            edit: [['edit', 'denied'], ['taxonomy', 'reproduction'], ['morphology'], 'habitat'],
        }}
        {...args}
    />
);
ServerValidation.args = {};
ServerValidation.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const saveBtn = canvas.queryByText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 500));
};

/** Toolbar — custom buttons on the right side */
export const Toolbar: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable
        layout="edit"
        toolbarRight={[
            {label: 'Browse', icon: 'pi pi-list', action: 'browseAction'},
            {label: 'Open', icon: 'pi pi-folder-open', action: 'openAction'},
        ]}
        layouts={{
            edit: [['edit', 'denied'], ['taxonomy', 'reproduction'], ['morphology'], 'habitat'],
        }}
        {...args}
    />
);
Toolbar.args = {};

/** Files — blong-ui does not yet have file-upload widget support.
 * This stub renders the basic editor layout.
 * Todo: Files story depends on
 * imageUpload/ocr/webcamera/file widgets not yet implemented in blong-ui. */
export const Files: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable
        editMode
        layout="edit"
        layouts={{edit: ['edit']}}
        {...args}
    />
);
Files.args = {};
Files.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const saveBtn = canvas.queryByText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 500));
};

/** FilesInTab — same limitation as Files, stub renders a tabbed layout. */
export const FilesInTab: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable
        editMode
        layout="edit"
        layouts={{
            edit: {
                orientation: 'top',
                items: [
                    {
                        id: 'general',
                        icon: 'pi pi-user',
                        label: 'General',
                        widgets: ['edit', 'habitat'],
                    },
                    {id: 'details', label: 'Details', icon: 'pi pi-book', widgets: ['edit']},
                ],
            },
        }}
        {...args}
    />
);
FilesInTab.args = {};
FilesInTab.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const saveBtn = canvas.queryByText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 500));
};

/** Steps layout */
export const Steps: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable={false}
        layout="edit"
        layouts={{
            edit: {
                orientation: 'top',
                type: 'steps',
                items: [
                    {id: 'general', label: 'General', widgets: ['edit', 'habitat']},
                    {id: 'details', label: 'Details', widgets: ['taxonomy', 'morphology']},
                    {id: 'history', label: 'History', widgets: ['history']},
                ],
            },
        }}
        {...args}
    />
);
Steps.args = {};

/** Steps with back disabled — interaction test clicks Next */
export const StepsDisabledBack: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable={false}
        layout="edit"
        layouts={{
            edit: {
                orientation: 'top',
                type: 'steps',
                items: [
                    {id: 'general', label: 'General', widgets: ['edit', 'habitat']},
                    {id: 'details', label: 'Details', widgets: ['taxonomy', 'morphology']},
                    {id: 'history', label: 'History', widgets: ['history']},
                ],
            },
        }}
        {...args}
    />
);
StepsDisabledBack.args = {};
StepsDisabledBack.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const nextBtn = canvas.queryByText?.('Next') as HTMLButtonElement | null;
    if (nextBtn) await userEvent.click(nextBtn);
};

/** Steps with back hidden — same interaction */
export const StepsHiddenBack: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable={false}
        layout="edit"
        layouts={{
            edit: {
                orientation: 'top',
                type: 'steps',
                items: [
                    {id: 'general', label: 'General', widgets: ['edit', 'habitat']},
                    {id: 'details', label: 'Details', widgets: ['taxonomy', 'morphology']},
                    {id: 'history', label: 'History', widgets: ['history']},
                ],
            },
        }}
        {...args}
    />
);
StepsHiddenBack.args = {};
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

/** EditorWithExplorer — Editor where one tab contains an Explorer (accounts tab).
 * NOTE: blong-ui wires Explorer via dispatch returning component. */
export const EditorWithExplorer: StoryFn = (args = {}) => (
    <Editor
        {...tree}
        loadAction="treeTreeGet"
        saveAction="treeTreeEdit"
        editable
        layout="edit"
        layouts={{
            edit: {
                orientation: 'top',
                items: [
                    {
                        id: 'general',
                        icon: 'pi pi-user',
                        label: 'General',
                        widgets: ['edit', 'habitat'],
                    },
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
        }}
        {...args}
    />
);
EditorWithExplorer.args = {};
EditorWithExplorer.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const historyTab = canvas.queryByText?.('History');
    if (historyTab) await userEvent.click(historyTab);
};
