/**
 * Coral Explorer — list and drill-down of coral species.
 */
import { Editor, Explorer } from '@feasibleone/blong-ui';
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { mockCorals } from '../../mockData.js';
import { coralSchema } from '../../schemas.js';

const meta: Meta = {
    title: 'Marine/Coral',
    tags: ['autodocs'],
    parameters: {layout: 'fullscreen'},
};
export default meta;

export const CoralExplorer: StoryObj = {
    render: () => {
        const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
        return (
            <div style={{display: 'flex', gap: '1rem', height: 600}}>
                <div style={{flex: 1}}>
                    <Explorer
                        schema={coralSchema}
                        columns={[
                            {field: 'coralName', header: 'Common Name', sortable: true},
                            {field: 'scientificName', header: 'Scientific Name', sortable: true},
                            {field: 'coralType', header: 'Type', sortable: true},
                            {field: 'maxDepth', header: 'Max Depth (m)', sortable: true},
                            {field: 'iucnStatus', header: 'IUCN'},
                        ]}
                        onSelectionChange={v => setSelected(v as Record<string, unknown>)}
                        toolbar={[{label: 'Add Coral', icon: 'pi pi-plus'}]}
                        toolbarRight={[{label: 'Export', icon: 'pi pi-download'}]}
                    />
                </div>
                {selected && (
                    <div style={{width: 400}}>
                        <Editor
                            schema={coralSchema}
                            value={selected}
                            editable
                        />
                    </div>
                )}
            </div>
        );
    },
};

export const CoralEditor: StoryObj = {
    render: () => (
        <Editor
            schema={coralSchema}
            value={mockCorals[1]}
            editMode
        />
    ),
};

export const CoralEditorReadOnly: StoryObj = {
    render: () => (
        <Editor
            schema={coralSchema}
            value={mockCorals[0]}
            readOnly
        />
    ),
    name: 'CoralEditor (ReadOnly)',
};
