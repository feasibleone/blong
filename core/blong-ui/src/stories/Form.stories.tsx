import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Form } from '../components/Form/index.js';
import type { IEnrichedSchema } from '../types/widget.js';

const meta: Meta<typeof Form> = {
    title: 'Forms/Form',
    component: Form,
    tags: ['autodocs'],
    parameters: {layout: 'padded'},
};
export default meta;

type Story = StoryObj<typeof Form>;

const coralSchema: IEnrichedSchema = {
    title: 'Coral Species',
    properties: {
        speciesName: {title: 'Species Name', type: 'string', required: true, widget: {type: 'input'}},
        scientificName: {title: 'Scientific Name', type: 'string', widget: {type: 'input'}},
        coralType: {
            title: 'Coral Type',
            type: 'string',
            widget: {
                type: 'dropdown',
                options: [
                    {value: 'hard', label: 'Hard Coral'},
                    {value: 'soft', label: 'Soft Coral'},
                    {value: 'black', label: 'Black Coral'},
                ],
            },
        },
        maxDepth: {title: 'Max Depth (m)', type: 'number', widget: {type: 'integer'}},
        endangered: {title: 'Endangered', type: 'boolean', widget: {type: 'boolean'}},
        description: {title: 'Description', type: 'string', widget: {type: 'textArea'}},
    },
    required: ['speciesName'],
};

export const Default: Story = {
    render: () => {
        const [value, setValue] = useState({speciesName: 'Brain Coral', coralType: 'hard'});
        return <Form schema={coralSchema} value={value} onChange={setValue} />;
    },
};

export const ReadOnly: Story = {
    args: {
        schema: coralSchema,
        value: {speciesName: 'Staghorn Coral', scientificName: 'Acropora cervicornis', coralType: 'hard', maxDepth: 30},
        readOnly: true,
    },
};

export const Loading: Story = {
    args: {
        schema: coralSchema,
        loading: true,
    },
};
