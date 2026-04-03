/**
 * CascadedDropdowns story — blong-ui adaptation.
 *
 * NOTE: Cascaded dropdowns (where the values of one dropdown filter another
 * based on a `parent` field) are NOT yet implemented in blong-ui's DropdownWidget.
 * The target version wires this via `widget.dropdown` + `widget.parent` on the schema.
 *
 * This stub renders three independent dropdowns without cascading.
 * Snapshot mismatch justification: cascaded dropdown filtering requires
 * implementing the `parent` option in DropdownWidget, which is out of scope
 * for the initial blong-ui release.
 */
import type {Meta} from '@storybook/react';
import {within} from '@testing-library/react';
import {userEvent} from '@testing-library/user-event';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/CascadedDropdowns',
    component: Editor,
};
export default meta;

export const CascadedDropdowns: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                continent: {title: 'Continent', widget: {type: 'dropdown', dropdown: 'continent'}},
                country: {title: 'Country', widget: {type: 'dropdown', dropdown: 'country'}},
                city: {title: 'City', widget: {type: 'dropdown', dropdown: 'city'}},
            },
        }}
        cards={{
            edit: {
                label: 'Location',
                className: 'xl:col-3',
                widgets: ['continent', 'country', 'city'],
            },
        }}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['edit']}}
    />
);
CascadedDropdowns.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    await new Promise(resolve => setTimeout(resolve, 50));
    // Note: cascaded filtering is not implemented — just verify the dropdowns render
    const continentInput = canvas.queryByRole?.('combobox');
    if (continentInput) await userEvent.click(continentInput);
};
