/**
 * LayoutResolver Storybook stories.
 *
 * Demonstrates deriveDefaultLayout, deriveLayouts, createTabbedLayout,
 * and isTabbedLayout utilities.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {deriveDefaultLayout, createTabbedLayout, isTabbedLayout} from '../src/factory/LayoutResolver.js';
import type {Cards} from '../src/types.js';

function LayoutResolverDemo({
    cards,
    tabGroups,
}: {
    cards: Cards;
    tabGroups?: Array<{label: string; cards: string[]}>;
}) {
    const defaultLayout = deriveDefaultLayout(cards);
    const tabbedLayout = tabGroups ? createTabbedLayout(tabGroups) : null;
    return (
        <div>
            <h4>Default Layout Cards: {defaultLayout.cards.join(', ')}</h4>
            <p>Is tabbed: {String(isTabbedLayout(defaultLayout))}</p>
            {tabbedLayout && (
                <>
                    <h4>Tabbed Layout:</h4>
                    <p>Is tabbed: {String(isTabbedLayout(tabbedLayout))}</p>
                    {tabbedLayout.items?.map(tab => (
                        <div key={tab.label}>
                            <strong>{tab.label}</strong>: {tab.cards.join(', ')}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

const meta: Meta<typeof LayoutResolverDemo> = {
    title: 'Factory/LayoutResolver',
    component: LayoutResolverDemo,
};

export default meta;
type Story = StoryObj<typeof LayoutResolverDemo>;

const sampleCards: Cards = {
    details: {id: 'details', label: 'Details', widgets: ['userName', 'emailAddress']},
    contact: {id: 'contact', label: 'Contact', widgets: ['phoneNumber', 'address']},
    settings: {id: 'settings', label: 'Settings', widgets: ['isActive', 'roleId']},
};

export const DefaultLayout: Story = {
    args: {
        cards: sampleCards,
    },
};

export const TabbedLayout: Story = {
    args: {
        cards: sampleCards,
        tabGroups: [
            {label: 'General', cards: ['details', 'contact']},
            {label: 'Settings', cards: ['settings']},
        ],
    },
};

export const VerticalTabs: Story = {
    render: args => {
        const tabbedLayout = createTabbedLayout(
            [
                {label: 'Profile', cards: ['details']},
                {label: 'Contact', cards: ['contact']},
                {label: 'Settings', cards: ['settings']},
            ],
            'vertical',
        );
        return (
            <div>
                <h4>Vertical Tabbed Layout</h4>
                <p>Orientation: {tabbedLayout.orientation}</p>
                <p>Is tabbed: {String(isTabbedLayout(tabbedLayout))}</p>
                {tabbedLayout.items?.map(tab => (
                    <div key={tab.label} style={{padding: '4px 0'}}>
                        <strong>{tab.label}</strong>: {tab.cards.join(', ')}
                    </div>
                ))}
            </div>
        );
    },
    args: {
        cards: sampleCards,
    },
};
