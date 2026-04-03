/**
 * Pivot stories — blong-ui adaptation.
 *
 * Table-based pivot view: each card renders a DataTable with column groups.
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {
    title: 'Editor/Pivot',
    component: Editor,
};
export default meta;

export const Pivot: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                groupA: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        columns: ['col1', 'col2', 'col3'],
                    },
                },
                groupB: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        columns: ['col1', 'col2', 'col3'],
                    },
                },
            },
        }}
        cards={{
            a: {label: 'Group A', widgets: ['groupA']},
            b: {label: 'Group B', widgets: ['groupB']},
        }}
        editable
        layout="edit"
        layouts={{edit: [['a', 'b']]}}
    />
);

export const PivotBG: StoryFn = () => (
    <Editor
        schema={{
            properties: {
                groupA: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        columns: ['col1', 'col2', 'col3'],
                    },
                },
                groupB: {
                    title: '',
                    type: 'array',
                    widget: {
                        type: 'table',
                        columns: ['col1', 'col2', 'col3'],
                    },
                },
            },
        }}
        cards={{
            a: {label: 'Група А', widgets: ['groupA']},
            b: {label: 'Група Б', widgets: ['groupB']},
        }}
        editable
        layout="edit"
        layouts={{edit: [['a', 'b']]}}
    />
);
