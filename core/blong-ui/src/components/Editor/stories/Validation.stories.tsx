/**
 * Validation stories — client-side validation tests.
 * Uses Template from Editor.stories to avoid repeating the tree fixture.
 */
import type {Meta} from '@storybook/react';
import {within} from '@testing-library/react';
import {userEvent} from '@testing-library/user-event';
import type {StoryFn} from '../Editor.stories.js';
import {Template} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/Validation', component: Editor};
export default meta;

/** Validation — clear required field and submit to trigger validation errors */
export const Validation: StoryFn = Template.bind({});
Validation.args = {
    editMode: true,
    value: {treeName: 'Oak', treeType: 1, treeDescription: ''},
};
Validation.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    const nameInput = canvas.queryByLabelText?.('Name') as HTMLInputElement | null;
    if (nameInput) await userEvent.clear(nameInput);
    const descInput = canvas.queryByLabelText?.('Description') as HTMLTextAreaElement | null;
    if (descInput) await userEvent.type(descInput, 'test');
    const saveBtn = canvas.queryByText?.('Save') as HTMLButtonElement | null;
    if (saveBtn) await userEvent.click(saveBtn);
    await new Promise(resolve => setTimeout(resolve, 1000));
};

/**
 * ValidationBG — same validation with Bulgarian locale.
 * NOTE: blong-ui does not yet support per-story locale switching.
 */
export const ValidationBG: StoryFn = Template.bind({});
ValidationBG.args = {
    ...Validation.args,
    value: {treeName: 'Дъб', treeType: 1, treeDescription: ''},
};
ValidationBG.play = Validation.play;
