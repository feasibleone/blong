import type { Meta, StoryObj } from '@storybook/react';
import { Explorer } from '../components/Explorer/index.js';

const meta: Meta<typeof Explorer> = {
    title: 'Data/Explorer',
    component: Explorer,
    tags: ['autodocs'],
    parameters: {layout: 'fullscreen'},
};
export default meta;

type Story = StoryObj<typeof Explorer>;

const columns = [
    {field: 'speciesName', header: 'Species Name', sortable: true},
    {field: 'coralType', header: 'Type', sortable: true},
    {field: 'maxDepth', header: 'Max Depth', sortable: true},
    {field: 'endangered', header: 'Endangered', sortable: false},
];

const mockData = [
    {id: 1, speciesName: 'Brain Coral', coralType: 'Hard', maxDepth: 20, endangered: false},
    {id: 2, speciesName: 'Staghorn Coral', coralType: 'Hard', maxDepth: 30, endangered: true},
    {id: 3, speciesName: 'Sea Fan', coralType: 'Soft', maxDepth: 40, endangered: false},
    {id: 4, speciesName: 'Black Wire Coral', coralType: 'Black', maxDepth: 200, endangered: true},
];

export const Default: Story = {
    args: {
        columns,
        // When no listAction, explorer shows empty state
        // In real use, provide a listAction pointing to a registered handler
    },
};

export const WithStaticData: Story = {
    render: () => {
        // Override the data by providing a schema with pre-loaded data via a mock
        return (
            <div style={{height: 500}}>
                <Explorer
                    columns={columns}
                    onSelectionChange={v => console.log('selected', v)}
                    toolbar={[{label: 'Add', icon: 'pi pi-plus'}]}
                />
            </div>
        );
    },
};
