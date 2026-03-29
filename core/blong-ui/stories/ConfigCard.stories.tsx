/**
 * ConfigCard Storybook stories.
 *
 * Demonstrates ConfigCard in design mode, normal mode, and selected state
 * using a mock DesignContext.Provider.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {ConfigCard} from '../src/design/ConfigCard.js';
import {DesignContext} from '../src/hooks/useDesign.js';
import type {DesignContextValue} from '../src/hooks/useDesign.js';
import type {Card} from '../src/types.js';

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

// ── Sample data ───────────────────────────────────────────────────────────────

const sampleCard: Card = {id: 'account', label: 'Account Details', widgets: ['userName', 'emailAddress']};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof ConfigCard> = {
    title: 'Design/ConfigCard',
    component: ConfigCard,
};

export default meta;
type Story = StoryObj<typeof ConfigCard>;

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
        card: sampleCard,
        onRemove: () => console.log('Remove card:', sampleCard.id),
        children: <div style={{padding: '8px', fontFamily: 'monospace'}}>Card content here</div>,
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
        card: sampleCard,
        children: <div style={{padding: '8px', fontFamily: 'monospace'}}>Card content here</div>,
    },
};

export const Selected: Story = {
    name: 'Selected',
    decorators: [
        (Story) => (
            <DesignContext.Provider value={{...designModeContext, selectedId: `card:${sampleCard.id}`}}>
                <Story />
            </DesignContext.Provider>
        ),
    ],
    args: {
        card: sampleCard,
        onRemove: () => console.log('Remove card:', sampleCard.id),
        children: <div style={{padding: '8px', fontFamily: 'monospace'}}>Card content here</div>,
    },
};
