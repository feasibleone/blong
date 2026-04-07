/**
 * Pivot stories — blong-browser adaptation.
 *
 * Table-based pivot view: each card renders a DataTable with column groups.
 */
import type {Meta} from '@storybook/react';
import type {StoryFn} from '../Editor.stories.js';
import {Editor} from '../index.js';

const meta: Meta<typeof Editor> = {title: 'Editor/Pivot', component: Editor};
export default meta;

const pivotSchema = {
    properties: {
        groupA: {
            title: '' as const,
            type: 'array' as const,
            widget: {type: 'table' as const, columns: ['col1', 'col2', 'col3']},
        },
        groupB: {
            title: '' as const,
            type: 'array' as const,
            widget: {type: 'table' as const, columns: ['col1', 'col2', 'col3']},
        },
    },
};

const PivotTemplate: StoryFn = (args = {}) => (
    <Editor
        schema={pivotSchema}
        editable
        layout="edit"
        layouts={{edit: [['a', 'b']]}}
        {...args}
    />
);

export const Pivot: StoryFn = PivotTemplate.bind({});
Pivot.args = {
    cards: {
        a: {label: 'Group A', widgets: ['groupA']},
        b: {label: 'Group B', widgets: ['groupB']},
    },
};

export const PivotBG: StoryFn = PivotTemplate.bind({});
PivotBG.args = {
    cards: {
        a: {label: 'Група А', widgets: ['groupA']},
        b: {label: 'Група Б', widgets: ['groupB']},
    },
};
