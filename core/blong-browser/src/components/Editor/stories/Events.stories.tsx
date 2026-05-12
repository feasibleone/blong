/**
 * Events stories — field-change events and form API interactions.
 */
import type {Meta} from '@storybook/react-vite';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../Editor.js';

const meta: Meta<typeof Editor> = {title: 'Editor/Events', component: Editor};
export default meta;

export const Events: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                a: {title: 'A', type: 'integer', widget: {onChange: 'handleA'}} as never,
                b: {title: 'B', type: 'integer', widget: {onChange: 'handleB'}} as never,
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
        methods={{
            async handleA(params) {
                const {form, value} = params as {form: {getValues: (f: string) => unknown; setValue: (f: string, v: unknown) => void}; value: unknown};
                const sum = Number(form.getValues('b')) + Number(value);
                form.setValue('sum', sum);
            },
            async handleB(params) {
                const {form, value} = params as {form: {getValues: (f: string) => unknown; setValue: (f: string, v: unknown) => void}; value: unknown};
                const sum = Number(form.getValues('a')) + Number(value);
                form.setValue('sum', sum);
            },
        }}
    />
);

export const EventsFormAPI: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                visible: {title: 'Visible', type: 'boolean'},
                enabled: {title: 'Enabled', type: 'boolean'},
                input: {
                    title: 'Conditional Input',
                    widget: {visible: 'visible', enabled: 'enabled'},
                } as never,
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
