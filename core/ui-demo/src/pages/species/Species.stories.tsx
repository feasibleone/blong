import {Editor, Explorer} from '@feasibleone/blong-ui';
import type {Meta, StoryObj} from '@storybook/react';
import {mockSpecies} from '../../mockData.js';
import {speciesSchema} from '../../schemas.js';

const meta: Meta = {
    title: 'Marine/Species',
    tags: ['autodocs'],
    parameters: {layout: 'fullscreen'},
};
export default meta;

const columns = [
    {field: 'speciesName', header: 'Common Name', sortable: true},
    {field: 'genus', header: 'Genus', sortable: true},
    {field: 'species', header: 'Species', sortable: true},
    {field: 'bodyLength', header: 'Length (cm)', sortable: true},
    {field: 'diet', header: 'Diet', sortable: false},
    {field: 'endangered', header: 'Endangered', sortable: false},
];

export const SpeciesExplorer: StoryObj = {
    render: () => (
        <div style={{height: 600}}>
            <Explorer
                schema={speciesSchema}
                columns={columns}
                toolbar={[{label: 'Add', icon: 'pi pi-plus'}]}
            />
        </div>
    ),
};

export const SpeciesEditor: StoryObj = {
    render: () => (
        <Editor
            schema={speciesSchema}
            value={mockSpecies[0]}
            editMode
        />
    ),
};
