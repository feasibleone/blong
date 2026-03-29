/**
 * SelectCard Storybook stories.
 *
 * Demonstrates the card selection dialog used to add cards to a layout in
 * the design editor.
 */

import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, userEvent, within} from '@storybook/test';
import React from 'react';

import {SelectCard} from '../src/design/SelectCard.js';
import type {Cards, Layout} from '../src/types.js';

const allCards: Cards = {
    account: {id: 'account', label: 'Account', widgets: []},
    personal: {id: 'personal', label: 'Personal Information', widgets: []},
    address: {id: 'address', label: 'Address', widgets: []},
    notes: {id: 'notes', label: 'Notes', widgets: []},
};

// Only 'account' is in the current layout; personal/address/notes are available
const currentLayout: Layout = {cards: ['account']};

function SelectCardDemo() {
    const [visible, setVisible] = React.useState(true);
    const [selected, setSelected] = React.useState<string | null>(null);
    return (
        <div>
            <button onClick={() => setVisible(true)}>Add Card to Layout</button>
            {selected && (
                <p>
                    Last added card: <strong>{selected}</strong>
                </p>
            )}
            <SelectCard
                cards={allCards}
                layout={currentLayout}
                visible={visible}
                onClose={() => setVisible(false)}
                onSelect={id => {
                    setSelected(id);
                    setVisible(false);
                }}
            />
        </div>
    );
}

const meta: Meta<typeof SelectCard> = {
    title: 'Design/SelectCard',
    component: SelectCard,
};
export default meta;
type Story = StoryObj<typeof SelectCard>;

export const Open: Story = {
    render: () => (
        <SelectCard
            cards={allCards}
            layout={currentLayout}
            visible={true}
            onClose={() => {}}
            onSelect={() => {}}
        />
    ),
};

export const Interactive: Story = {
    render: () => <SelectCardDemo />,
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);

        // Wait for the search input — rendered as type="search" (role="searchbox")
        const searchInput = await canvas.findByRole('searchbox');
        await userEvent.type(searchInput, 'personal');

        // Only 'Personal Information' should be visible after filtering
        await expect(canvas.getByText('Personal Information')).toBeInTheDocument();
        await expect(canvas.queryByText('Address')).not.toBeInTheDocument();

        // Select the filtered card
        await userEvent.click(canvas.getByText('Personal Information'));

        // The demo should show the selected card id
        await canvas.findByText('personal');
    },
};
