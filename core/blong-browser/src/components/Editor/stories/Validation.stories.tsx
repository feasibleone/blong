/**
 * Validation stories — client-side validation tests.
 * Uses Template from Editor.stories to avoid repeating the coral fixture.
 */
import type {Meta} from '@storybook/react-vite';
import {Editor} from '../Editor.js';
import type {StoryFn} from '../Editor.stories.js';
import {Template} from '../Editor.stories.js';

const meta: Meta<typeof Editor> = {title: 'Editor/Validation', component: Editor};
export default meta;

/** Validation — clear required field and submit to trigger client-side validation errors */
export const Validation: StoryFn = Template.bind({});
Validation.args = {
    editMode: true,
    value: {coralName: 'Staghorn Coral', coralType: 'hard', coralDescription: ''},
};
Validation.play = async ({canvas, userEvent}) => {
    // Value is static — form renders synchronously. Use getByRole for accessible-name matching
    // (which correctly excludes aria-hidden content like the required '*' marker).
    await userEvent.clear(await canvas.findByRole('textbox', {name: 'Name'}));
    await userEvent.type(canvas.getByRole('textbox', {name: 'Description'}), 'test');
    await userEvent.click(canvas.getByRole('button', {name: 'Save'}));
    await new Promise(resolve => setTimeout(resolve, 200));
};

/**
 * ValidationBG — same validation with Bulgarian locale.
 * Uses `lang: 'bg'` story arg — all labels and error messages are translated.
 */
export const ValidationBG: StoryFn = Template.bind({});
ValidationBG.args = {
    ...Validation.args,
    lang: 'bg',
};
ValidationBG.play = async ({canvas, userEvent}) => {
    await userEvent.clear(await canvas.findByRole('textbox', {name: 'Име'}));
    await userEvent.type(canvas.getByRole('textbox', {name: 'Описание'}), 'тест');
    await userEvent.click(canvas.getByRole('button', {name: 'Save'}));
    await new Promise(resolve => setTimeout(resolve, 200));
};
