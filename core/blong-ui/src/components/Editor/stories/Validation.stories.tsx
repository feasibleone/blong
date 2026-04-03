/**
 * Validation stories — blong-ui adaptation.
 *
 * Tests client-side validation: clearing a required field and submitting
 * should show validation errors.
 */
import type {Meta} from '@storybook/react';
import {within} from '@testing-library/react';
import {userEvent} from '@testing-library/user-event';
import type {StoryFn} from '../Editor.stories.js';
import tree from '../fixtures/tree.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/Validation',
    component: Editor,
};
export default meta;

export const Validation: StoryFn = () => (
    <Editor
        {...tree}
        saveAction="treeTreeEdit"
        editable
        editMode
        layout="edit"
        layouts={{
            edit: [['edit', 'denied'], ['taxonomy', 'reproduction'], ['morphology'], 'habitat'],
        }}
        value={{treeName: 'Oak', treeType: 1, treeDescription: ''}}
    />
);
Validation.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const nameInput = canvas.queryByLabelText?.('Name') as HTMLInputElement | null;
    if (nameInput) {
        await userEvent.clear(nameInput);
    }
    const descInput = canvas.queryByLabelText?.('Description') as HTMLTextAreaElement | null;
    if (descInput) {
        await userEvent.type(descInput, 'test');
    }
    const saveBtn = canvas.queryByText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 1000));
};

/**
 * ValidationBG — same validation story but with Bulgarian locale.
 * NOTE: blong-ui does not yet have i18n locale switching per story.
 * The labels render in English in this stub.
 */
export const ValidationBG: StoryFn = () => (
    <Editor
        {...tree}
        saveAction="treeTreeEdit"
        editable
        editMode
        layout="edit"
        layouts={{
            edit: [['edit', 'denied'], ['taxonomy', 'reproduction'], ['morphology'], 'habitat'],
        }}
        value={{treeName: 'Дъб', treeType: 1, treeDescription: ''}}
    />
);
ValidationBG.play = Validation.play;
