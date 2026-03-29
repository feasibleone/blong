/**
 * CardResolver Storybook stories.
 *
 * Demonstrates deriveCardsFromSchema, resolveCards, and isCardVisible
 * utilities with various schema configurations.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {deriveCardsFromSchema} from '../src/factory/CardResolver.js';
import type {BlongSchema} from '../src/types.js';

function CardResolverDemo({schema}: {schema: BlongSchema}) {
    const cards = deriveCardsFromSchema(schema);
    return (
        <div>
            <h4>Derived Cards:</h4>
            {Object.entries(cards).map(([id, card]) => (
                <div key={id} style={{border: '1px solid #ccc', padding: '8px', margin: '4px'}}>
                    <strong>{card.label ?? id}</strong>
                    <ul>{card.widgets.map(w => <li key={String(w)}>{String(w)}</li>)}</ul>
                </div>
            ))}
        </div>
    );
}

const meta: Meta<typeof CardResolverDemo> = {
    title: 'Factory/CardResolver',
    component: CardResolverDemo,
};

export default meta;
type Story = StoryObj<typeof CardResolverDemo>;

export const DerivedFromGroups: Story = {
    args: {
        schema: {
            type: 'object',
            properties: {
                firstName: {type: 'string', title: 'First Name', 'x-blong-group': 'personal', 'x-blong-order': 1},
                lastName: {type: 'string', title: 'Last Name', 'x-blong-group': 'personal', 'x-blong-order': 2},
                emailAddress: {type: 'string', title: 'Email', 'x-blong-group': 'contact', 'x-blong-order': 1},
                phoneNumber: {type: 'string', title: 'Phone', 'x-blong-group': 'contact', 'x-blong-order': 2},
                notes: {type: 'string', title: 'Notes', 'x-blong-order': 1},
            },
        } as BlongSchema,
    },
};

export const NoGroups: Story = {
    args: {
        schema: {
            type: 'object',
            properties: {
                userName: {type: 'string', title: 'Username', 'x-blong-order': 1},
                emailAddress: {type: 'string', title: 'Email', 'x-blong-order': 2},
                isActive: {type: 'boolean', title: 'Active', 'x-blong-order': 3},
            },
        } as BlongSchema,
    },
};

export const WithHiddenFields: Story = {
    args: {
        schema: {
            type: 'object',
            properties: {
                userId: {type: 'integer', title: 'User ID', 'x-blong-hidden': true, 'x-blong-order': 0},
                userName: {type: 'string', title: 'Username', 'x-blong-order': 1},
                internalToken: {type: 'string', title: 'Token', 'x-blong-hidden': true, 'x-blong-order': 2},
                emailAddress: {type: 'string', title: 'Email', 'x-blong-order': 3},
            },
        } as BlongSchema,
    },
};
