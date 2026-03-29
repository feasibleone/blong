/**
 * ConfigField Storybook stories.
 *
 * Demonstrates ConfigField in design mode, normal mode, and selected state
 * using a mock DesignContext.Provider.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {ConfigField} from '../src/design/ConfigField.js';
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

const normalModeContext: DesignContextValue = {...designModeContext, isDesignMode: false};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof ConfigField> = {
    title: 'Design/ConfigField',
    component: ConfigField,
};

export default meta;
type Story = StoryObj<typeof ConfigField>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const DesignMode: Story = {
    name: 'Design Mode',
    decorators: [
        (Story) => (
            <DesignContext.Provider value={designModeContext}>
                <Story />
            </DesignContext.Provider>
        ),
    ],
    args: {
        name: 'userName',
        label: 'Username',
        cardId: 'account',
        onRemove: (fieldName, cardId) => console.log('Remove field:', fieldName, 'from card:', cardId),
        children: <input type="text" placeholder="Username" style={{width: '100%'}} />,
    },
};

export const NormalMode: Story = {
    name: 'Normal Mode',
    decorators: [
        (Story) => (
            <DesignContext.Provider value={normalModeContext}>
                <Story />
            </DesignContext.Provider>
        ),
    ],
    args: {
        name: 'userName',
        label: 'Username',
        cardId: 'account',
        children: <input type="text" placeholder="Username" style={{width: '100%'}} />,
    },
};

export const Selected: Story = {
    name: 'Selected',
    decorators: [
        (Story) => (
            <DesignContext.Provider value={{...designModeContext, selectedId: 'field:userName'}}>
                <Story />
            </DesignContext.Provider>
        ),
    ],
    args: {
        name: 'userName',
        label: 'Username',
        cardId: 'account',
        onRemove: (fieldName, cardId) => console.log('Remove field:', fieldName, 'from card:', cardId),
        children: <input type="text" placeholder="Username" style={{width: '100%'}} />,
    },
};
