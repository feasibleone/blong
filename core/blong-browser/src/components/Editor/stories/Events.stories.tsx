/**
 * Events stories — field-change events and form API interactions.
 *
 * When blong-browser adds method dispatch support, this story should wire:
 *   - `onFieldChange: 'handleFieldChange'` → dispatch handler
 *   - `methods: { async handleFieldChange({field, value}) {...} }`
 */
import type {Meta} from '@storybook/react-vite';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/Events', component: Editor};
export default meta;

export const Events: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                a: {title: 'A', type: 'integer'},
                b: {title: 'B', type: 'integer'},
                sum: {title: 'Sum', type: 'number', readOnly: true},
            },
        }}
        cards={{
            edit: {label: 'Field Events', className: 'lg:col-3', widgets: ['a', 'b', 'sum']},
        }}
        value={{a: 0, b: 0, sum: 0}}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['edit']}}
    />
);

export const EventsFormAPI: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                visible: {title: 'Visible', type: 'boolean'},
                enabled: {title: 'Enabled', type: 'boolean'},
                input: {title: 'Conditional Input'},
            },
        }}
        cards={{
            edit: {
                label: 'Form API',
                className: 'lg:col-3',
                widgets: ['visible', 'enabled', 'input'],
            },
        }}
        value={{visible: true, enabled: true, input: ''}}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['edit']}}
    />
);
