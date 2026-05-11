/**
 * CustomEditors story — mirrors ut-prime's CustomEditors pattern.
 *
 * A custom `Period` editor component is registered via the `editors` prop.
 * It receives `Input`, `Label`, and `ErrorLabel` factory components and lays
 * out the `period` (integer) + `unit` (select) fields in a single grid row.
 * The `Period.properties` static array tells the framework which schema fields
 * the editor covers so they are correctly tracked for validation and visibility.
 */
import type {Meta} from '@storybook/react-vite';
import type {ICustomEditorProps} from '../../Form/FormContext.js';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/CustomEditors', component: Editor};
export default meta;

function Period({Input, Label, ErrorLabel}: ICustomEditorProps) {
    return (
        <>
            <ErrorLabel />
            <div className="field grid w-full mx-0">
                <Label
                    className="col-12 md:col-2"
                    name="period"
                />
                <Input
                    fieldClass="md:col-4"
                    name="period"
                />
                <Input
                    fieldClass="md:col-6"
                    name="unit"
                />
            </div>
        </>
    );
}

Period.properties = ['period', 'unit'];

export const CustomEditors: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                unit: {
                    title: 'Unit',
                    widget: {
                        type: 'select',
                        options: [
                            {value: 'minutes', label: 'Minutes'},
                            {value: 'hours', label: 'Hours'},
                            {value: 'days', label: 'Days'},
                            {value: 'months', label: 'Months'},
                        ],
                    },
                },
                period: {
                    title: 'Expiration period',
                    type: 'integer',
                },
            },
        }}
        cards={{
            edit: {label: 'Expiration', widgets: ['Period']},
        }}
        editors={{Period}}
        value={{period: 5, unit: 'days'}}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['edit']}}
    />
);
