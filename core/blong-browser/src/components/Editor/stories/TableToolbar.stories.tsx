/**
 * TableToolbar stories — table widget with Add/Delete toolbar.
 *
 * Demonstrates a table card where the toolbar label acts as the card title
 * and custom actions appear on the right (via widget.label pattern).
 */
import type { Meta } from '@storybook/react-vite';
import type { StoryFn } from '../Editor.stories.js';
import { Editor } from '../Editor.js';

const meta: Meta<typeof Editor> = {title: 'Editor/TableToolbar', component: Editor};
export default meta;

export const TableToolbar: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                table: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        label: 'Items',
                        columns: ['id', 'name'],
                    },
                    items: {
                        properties: {
                            id: {title: 'ID', type: 'integer'},
                            name: {title: 'Name'},
                        },
                    },
                },
            },
        }}
        cards={{
            center: {label: undefined, widgets: ['table']},
        }}
        value={{
            table: [
                {id: 1, name: 'row 1'},
                {id: 2, name: 'row 2'},
                {id: 3, name: 'row 3'},
            ],
        }}
        editable
        editMode
        layout="edit"
        layouts={{edit: ['center']}}
    />
);
