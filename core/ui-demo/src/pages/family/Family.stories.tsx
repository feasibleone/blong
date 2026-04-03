import { Editor, Explorer } from '@feasibleone/blong-ui';
import type { Meta, StoryObj } from '@storybook/react';
import { mockFamilies } from '../../mockData.js';
import { familySchema } from '../../schemas.js';

const meta: Meta = {
    title: 'Marine/Family',
    tags: ['autodocs'],
    parameters: {layout: 'fullscreen'},
};
export default meta;

const columns = [
    {field: 'familyName', header: 'Family', sortable: true},
    {field: 'order', header: 'Order', sortable: true},
    {field: 'class_', header: 'Class', sortable: true},
    {field: 'speciesCount', header: 'Species', sortable: true},
];

export const FamilyExplorer: StoryObj = {
    render: () => (
        <div style={{height: 600}}>
            <Explorer schema={familySchema} columns={columns} />
        </div>
    ),
};

export const FamilyEditor: StoryObj = {
    render: () => <Editor schema={familySchema} value={mockFamilies[0]} editMode />,
};
