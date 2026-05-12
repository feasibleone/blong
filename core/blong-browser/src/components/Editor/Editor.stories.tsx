/**
 * Editor stories — blong-browser adaptation
 *
 * Mapping notes:
 * - Uses marine biology coral fixture from @feasibleone/blong-marine/meta/storybook.js
 * - Schema and cards defined in blong-marine (coralEditorFixture) — single source of truth
 * - Handlers in .storybook/dispatch.tsx use coralCoral* prefix
 */
import coralEditorFixture, {
    coralStoryValue,
    marineDropdownData,
} from '@feasibleone/blong-marine/meta/storybook.js';
import type {Meta} from '@storybook/react-vite';
import type {within} from '@testing-library/react';
import type {UserEvent} from '@testing-library/user-event';
import React from 'react';
import {Card} from '../Card/Card.js';
import {Explorer} from '../Explorer/Explorer.js';
import type {IEditorProps} from './Editor.js';
import {Editor} from './Editor.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor',
    excludeStories: ['Template'],
    component: Editor,
};
export default meta;

export type StoryArgs = Partial<IEditorProps> & {lang?: string};
export type StoryFn = ((args: StoryArgs) => React.ReactElement) & {
    args?: StoryArgs;
    play?: (ctx: {canvas: ReturnType<typeof within>; userEvent: UserEvent}) => Promise<void>;
    decorators?: Array<(Story: React.ComponentType) => React.ReactElement>;
};

export const Basic: StoryFn = (args = {}) => (
    <Editor
        {...coralEditorFixture}
        value={coralStoryValue}
        saveAction="coralCoralSave"
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
        dropdowns={marineDropdownData}
        designable
        {...args}
    />
);
Basic.args = {};

/**
 * Shared template — coral schema + save wired; stories spread their args on top.
 * Sub-story files import this to use `Template.bind({})` + `.args` instead of
 * duplicating the JSX
 */
export const Template: StoryFn = (args = {}) => (
    <Editor
        {...coralEditorFixture}
        saveAction="coralCoralSave"
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

/** Loading — shows per-field skeleton; `coralCoralLoad` never resolves so loading state persists */
export const Loading: StoryFn = Template.bind({});
Loading.args = {loadAction: 'coralCoralLoad', editMode: true};

/** GetError — load rejects (e.g. unauthenticated); `coralCoralGetError` resolves with an error */
export const GetError: StoryFn = Template.bind({});
GetError.args = {loadAction: 'coralCoralGetError', editMode: true};

/**
 * DropdownError — dropdown loading rejects.
 * Uses `dropdown: 'marine.coralTypeError'` / `'marine.zoneError'` widget keys so
 * `portal.dropdown.list` receives an Error-suffixed name and rejects.
 */
export const DropdownError: StoryFn = (args = {}) => (
    <Editor
        {...coralEditorFixture}
        schema={{
            ...coralEditorFixture.schema,
            properties: {
                ...coralEditorFixture.schema.properties,
                coralType: {
                    ...(coralEditorFixture.schema.properties?.coralType ?? {}),
                    widget: {type: 'dropdown', dropdown: 'marine.coralTypeError'},
                },
                habitat: {
                    ...(coralEditorFixture.schema.properties?.habitat ?? {}),
                    widget: {type: 'multiSelectPanel', dropdown: 'marine.zoneError'},
                },
            },
        }}
        loadAction="coralCoralGet"
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
    loadAction: 'coralCoralGet',
    editMode: true,
    designable: true,
    initialDesignMode: true,
};

Design.play = async ({canvas, userEvent}) => {
    const descInput = canvas.queryByText?.('Type');
    if (descInput) await userEvent.click(descInput);
};

/** Tabbed layout */
export const Tabs: StoryFn = Template.bind({});
Tabs.args = {
    loadAction: 'coralCoralGet',
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
    loadAction: 'coralCoralGet',
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
Submit.play = async ({canvas, userEvent}) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const descInput = canvas.queryByLabelText?.('Description') as HTMLTextAreaElement | null;
    if (descInput) await userEvent.type(descInput, 'test');
    const saveBtn = canvas.queryByLabelText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) await userEvent.click(saveBtn);
};

/** Server-side validation errors shown in form fields */
export const ServerValidation: StoryFn = Template.bind({});
ServerValidation.args = {
    loadAction: 'coralCoralGet',
    editMode: true,
    saveAction: 'coralCoralEditError',
};
ServerValidation.play = async ({canvas, userEvent}) => {
    await new Promise(resolve => setTimeout(resolve, 200));
    // Make the form dirty so the Save button becomes enabled
    const nameInput = canvas.getByRole('textbox', {name: /name/i});
    await userEvent.tripleClick(nameInput);
    await userEvent.type(nameInput, 'Test');
    const saveBtn = canvas.getByRole('button', {name: 'Save'});
    await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 500));
};

/** Toolbar — custom buttons on the LEFT side beside save/reset */
export const Toolbar: StoryFn = Template.bind({});
Toolbar.args = {
    loadAction: 'coralCoralGet',
    editMode: true,
    toolbar: [
        {label: 'Browse', icon: 'pi pi-list', method: 'coralCoralSubmit'},
        {label: 'Open', icon: 'pi pi-folder-open', method: 'coralCoralSubmit', params: {id: 1}},
        {label: 'Error', icon: 'pi pi-times-circle', method: 'coralCoralSubmitError'},
        {
            label: 'Delay',
            icon: 'pi pi-clock',
            method: 'coralCoralSubmitDelay',
            params: {id: 1},
            successHint: 'Done',
        },
    ],
};

Toolbar.play = async ({canvas, userEvent}) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const errorBtn = canvas.queryByText?.('Error') as HTMLButtonElement | null;
    if (errorBtn) await userEvent.click(errorBtn);
};

/**
 * ToolbarBG — same as Toolbar but with Bulgarian translations applied.
 * Demonstrates multi-language support: card titles, field labels, column headers,
 * and built-in toolbar/widget button labels are all translated.
 * PrimeReact UI (e.g. Calendar month names) is also localized.
 */
export const ToolbarBG: StoryFn = Template.bind({});
ToolbarBG.args = {
    ...Toolbar.args,
    lang: 'bg',
};

ToolbarBG.play = async ({canvas, userEvent}) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const openButton = canvas.queryByText?.('Open') as HTMLButtonElement | null;
    if (openButton) await userEvent.click(openButton);
};

/** Files — stub; imageUpload/ocr/webcamera widgets not yet implemented in blong-browser. */
export const Files: StoryFn = Template.bind({});
Files.args = {loadAction: 'coralCoralGet', editMode: true, layouts: {edit: ['edit']}};
Files.play = async ({canvas, userEvent}) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const saveBtn = canvas.queryByText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 500));
};

/** FilesInTab — file widget in a tab (stub). */
export const FilesInTab: StoryFn = Template.bind({});
FilesInTab.args = {
    loadAction: 'coralCoralGet',
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
Steps.args = {loadAction: 'coralCoralGet', editable: false, layouts: {edit: stepsLayout}};

/** Steps with back disabled (stub — disableBack not yet in ITabLayoutConfig). */
export const StepsDisabledBack: StoryFn = Template.bind({});
StepsDisabledBack.args = {...Steps.args};
StepsDisabledBack.play = async ({canvas, userEvent}) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const nextBtn = canvas.queryByText?.('Next') as HTMLButtonElement | null;
    if (nextBtn) await userEvent.click(nextBtn);
};

/** Steps with back hidden (stub — hideBack not yet in ITabLayoutConfig). */
export const StepsHiddenBack: StoryFn = Template.bind({});
StepsHiddenBack.args = {...Steps.args};
StepsHiddenBack.play = StepsDisabledBack.play;

/** ExplorerTab — Explorer configured for the coral history tab */
function ExplorerTab() {
    return (
        <Card id="card-history">
            <Explorer
                columns={[
                    {field: 'coralName', header: 'Name'},
                    {field: 'habitat', header: 'Habitat'},
                    {field: 'coralType', header: 'Type'},
                ]}
                listAction="coralCoralHistoryFind"
            />
        </Card>
    );
}

/** EditorWithExplorer — one tab contains an Explorer component (history tab). */
export const EditorWithExplorer: StoryFn = Template.bind({});
EditorWithExplorer.args = {
    loadAction: 'coralCoralGet',
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
EditorWithExplorer.play = async ({canvas, userEvent}) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    const historyTab = canvas.queryByText?.('History');
    if (historyTab) await userEvent.click(historyTab);
};
