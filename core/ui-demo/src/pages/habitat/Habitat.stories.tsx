import { Editor, Explorer } from '@feasibleone/blong-ui';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { mockHabitats } from '../../mockData.js';
import { habitatSchema } from '../../schemas.js';

const meta: Meta = {
    title: 'Marine/Habitat',
    tags: ['autodocs'],
    parameters: {layout: 'fullscreen'},
};
export default meta;

const columns = [
    {field: 'habitatName', header: 'Name', sortable: true},
    {field: 'habitatType', header: 'Type', sortable: true},
    {field: 'oceanZone', header: 'Ocean Zone', sortable: true},
    {field: 'latitude', header: 'Lat', sortable: false},
    {field: 'longitude', header: 'Lon', sortable: false},
    {field: 'protectionStatus', header: 'Protected', sortable: false},
];

export const HabitatExplorer: StoryObj = {
    render: () => {
        const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
        return (
            <div style={{display: 'flex', gap: '1rem', height: 600}}>
                <div style={{flex: 1}}>
                    <Explorer
                        schema={habitatSchema}
                        columns={columns}
                        onSelectionChange={v => setSelected(v as Record<string, unknown>)}
                        toolbar={[{label: 'New Habitat', icon: 'pi pi-plus'}]}
                    />
                </div>
                {selected && (
                    <div style={{width: 420}}>
                        <Editor schema={habitatSchema} value={selected} editable />
                    </div>
                )}
            </div>
        );
    },
};

export const HabitatEditor: StoryObj = {
    render: () => <Editor schema={habitatSchema} value={mockHabitats[0]} editMode />,
};
