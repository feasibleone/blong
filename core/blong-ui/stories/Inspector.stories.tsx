/**
 * Inspector Storybook stories.
 *
 * Demonstrates the Inspector component with no selection, a selected field,
 * and a selected card, using a mock DesignContext.Provider.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {Inspector} from '../src/design/Inspector.js';
import {DesignContext} from '../src/hooks/useDesign.js';
import type {DesignContextValue} from '../src/hooks/useDesign.js';

// ── Mock design context values ────────────────────────────────────────────────

const designModeContext: DesignContextValue = {
    isDesignMode: true,
    toggleDesignMode: () => {},
    selectedId: null,
    setSelectedId: () => {},
    customisation: null,
    setCustomisation: () => {},
    save: () => {},
    isSaving: false,
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
};

const nothingSelectedContext: DesignContextValue = {...designModeContext, selectedId: null};
const fieldSelectedContext: DesignContextValue = {...designModeContext, selectedId: 'field:userName'};
const cardSelectedContext: DesignContextValue = {...designModeContext, selectedId: 'card:account'};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof Inspector> = {
    title: 'Design/Inspector',
    component: Inspector,
};

export default meta;
type Story = StoryObj<typeof Inspector>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const NothingSelected: Story = {
    name: 'Nothing Selected',
    decorators: [
        (Story) => (
            <DesignContext.Provider value={nothingSelectedContext}>
                <Story />
            </DesignContext.Provider>
        ),
    ],
    args: {
        onChange: (updates) => console.log('Property changed:', updates),
    },
};

export const FieldSelected: Story = {
    name: 'Field Selected',
    decorators: [
        (Story) => (
            <DesignContext.Provider value={fieldSelectedContext}>
                <Story />
            </DesignContext.Provider>
        ),
    ],
    args: {
        properties: {
            title: 'Username',
            'x-blong-widget': 'input',
            'x-blong-order': 1,
            'x-blong-hidden': false,
            'x-blong-readonly': false,
        },
        onChange: (updates) => console.log('Property changed:', updates),
    },
};

export const CardSelected: Story = {
    name: 'Card Selected',
    decorators: [
        (Story) => (
            <DesignContext.Provider value={cardSelectedContext}>
                <Story />
            </DesignContext.Provider>
        ),
    ],
    args: {
        properties: {
            label: 'Account Details',
            className: '',
            permission: '',
            hidden: false,
        },
        onChange: (updates) => console.log('Property changed:', updates),
    },
};
