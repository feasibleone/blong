/**
 * SelectField Storybook stories.
 *
 * Demonstrates the field selection dialog used to add fields to cards in
 * the design editor.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {within, userEvent, expect} from '@storybook/test';

import {SelectField} from '../src/design/SelectField.js';
import type {BlongSchema, Cards} from '../src/types.js';

const sampleSchema: BlongSchema = {
    type: 'object',
    properties: {
        userName: {type: 'string', title: 'Username'},
        emailAddress: {type: 'string', title: 'Email'},
        firstName: {type: 'string', title: 'First Name'},
        lastName: {type: 'string', title: 'Last Name'},
        phoneNumber: {type: 'string', title: 'Phone'},
        notes: {type: 'string', title: 'Notes'},
    },
} as BlongSchema;

// Only userName and emailAddress are already in cards; rest are available
const sampleCards: Cards = {
    main: {id: 'main', label: 'Main', widgets: ['userName', 'emailAddress']},
};

function SelectFieldDemo() {
    const [visible, setVisible] = React.useState(true);
    const [selected, setSelected] = React.useState<string | null>(null);
    return (
        <div>
            <button onClick={() => setVisible(true)}>Open Add Field Dialog</button>
            {selected && (
                <p>
                    Last selected: <strong>{selected}</strong>
                </p>
            )}
            <SelectField
                schema={sampleSchema}
                cards={sampleCards}
                visible={visible}
                onClose={() => setVisible(false)}
                onSelect={(name) => {
                    setSelected(name);
                    setVisible(false);
                }}
            />
        </div>
    );
}

const meta: Meta<typeof SelectField> = {
    title: 'Design/SelectField',
    component: SelectField,
};
export default meta;
type Story = StoryObj<typeof SelectField>;

export const Open: Story = {
    render: () => (
        <SelectField
            schema={sampleSchema}
            cards={sampleCards}
            visible={true}
            onClose={() => {}}
            onSelect={() => {}}
        />
    ),
};

export const Closed: Story = {
    render: () => (
        <div>
            <p>Dialog is closed — only the trigger button is shown below.</p>
            <SelectField
                schema={sampleSchema}
                cards={sampleCards}
                visible={false}
                onClose={() => {}}
                onSelect={() => {}}
            />
        </div>
    ),
};

export const Interactive: Story = {
    render: () => <SelectFieldDemo />,
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);

        // Wait for the dialog to be visible
        const searchInput = await canvas.findByRole('textbox');
        await userEvent.type(searchInput, 'first');

        // Only 'First Name' should be visible after filtering
        await expect(canvas.getByText('First Name')).toBeInTheDocument();
        await expect(canvas.queryByText('Last Name')).not.toBeInTheDocument();

        // Select the filtered field
        await userEvent.click(canvas.getByText('First Name'));

        // The demo should show the selected field name
        await canvas.findByText('firstName');
    },
};
