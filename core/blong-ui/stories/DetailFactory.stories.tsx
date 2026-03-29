/**
 * DetailFactory Storybook stories.
 *
 * Demonstrates the DetailFactory component with flat fields, card groupings,
 * loading skeletons and empty/null data.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {DetailFactory} from '../src/factory/DetailFactory.js';
import type {BlongSchema, Cards} from '../src/types.js';

// ── Sample schema ─────────────────────────────────────────────────────────────

const contactSchema: BlongSchema = {
    type: 'object',
    properties: {
        firstName: {type: 'string', title: 'First Name', 'x-blong-order': 1},
        lastName: {type: 'string', title: 'Last Name', 'x-blong-order': 2},
        emailAddress: {type: 'string', title: 'Email Address', 'x-blong-order': 3},
        phoneNumber: {type: 'string', title: 'Phone Number', 'x-blong-order': 4},
        isActive: {type: 'boolean', title: 'Active', 'x-blong-order': 5},
        salary: {
            type: 'number',
            title: 'Salary',
            'x-blong-widget': 'currency',
            'x-blong-currency': 'USD',
            'x-blong-order': 6,
        },
        birthDate: {type: 'string', title: 'Birth Date', 'x-blong-widget': 'date', 'x-blong-order': 7},
        notes: {type: 'string', title: 'Notes', 'x-blong-order': 8},
    },
} as BlongSchema;

const contactCards: Cards = {
    personal: {
        id: 'personal',
        label: 'Personal Information',
        widgets: ['firstName', 'lastName', 'birthDate'],
    },
    contact: {
        id: 'contact',
        label: 'Contact Details',
        widgets: ['emailAddress', 'phoneNumber'],
    },
    employment: {
        id: 'employment',
        label: 'Employment',
        widgets: ['isActive', 'salary', 'notes'],
    },
};

const sampleData: Record<string, unknown> = {
    firstName: 'Alice',
    lastName: 'Smith',
    emailAddress: 'alice@example.com',
    phoneNumber: '+1-555-0100',
    isActive: true,
    salary: 85000,
    birthDate: '1990-06-15',
    notes: 'Senior developer',
};

const emptyData: Record<string, unknown> = {
    firstName: null,
    lastName: null,
    emailAddress: null,
    phoneNumber: null,
    isActive: null,
    salary: null,
    birthDate: null,
    notes: null,
};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof DetailFactory> = {
    title: 'Factory/DetailFactory',
    component: DetailFactory,
};

export default meta;
type Story = StoryObj<typeof DetailFactory>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
    name: 'Default (Flat Fields)',
    args: {
        schema: contactSchema,
        data: sampleData,
    },
};

export const WithCards: Story = {
    name: 'WithCards (Grouped)',
    args: {
        schema: contactSchema,
        data: sampleData,
        cards: contactCards,
    },
};

export const Loading: Story = {
    args: {
        schema: contactSchema,
        data: {},
        isLoading: true,
    },
};

export const EmptyData: Story = {
    name: 'EmptyData (All Null)',
    args: {
        schema: contactSchema,
        data: emptyData,
    },
};
