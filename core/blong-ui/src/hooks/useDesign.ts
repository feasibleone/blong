/**
 * useDesign — design editor context.
 *
 * Provides a React context for the design mode state: whether design mode
 * is active, the selected element, and methods for toggling the editor.
 */

import {createContext, useContext} from 'react';

import type {Customisation} from '../types.js';

/** Design mode context value. */
export interface DesignContextValue {
    /** Whether design mode is currently active. */
    isDesignMode: boolean;
    /** Toggle design mode on/off. */
    toggleDesignMode: () => void;
    /** The currently selected card or field identifier. */
    selectedId: string | null;
    /** Select a card or field for inspection. */
    setSelectedId: (id: string | null) => void;
    /** Current local customisation state. */
    customisation: Customisation | null;
    /** Apply a customisation change locally. */
    setCustomisation: (update: Partial<Customisation>) => void;
    /** Save the current customisation to the server. */
    save: () => void;
    /** Whether a save is in progress. */
    isSaving: boolean;
    /** Undo the last change. */
    undo: () => void;
    /** Redo the last undone change. */
    redo: () => void;
    /** Whether undo is available. */
    canUndo: boolean;
    /** Whether redo is available. */
    canRedo: boolean;
}

const defaultValue: DesignContextValue = {
    isDesignMode: false,
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

export const DesignContext = createContext<DesignContextValue>(defaultValue);

/**
 * Hook to access the design editor context.
 *
 * @example
 * ```tsx
 * const { isDesignMode, toggleDesignMode } = useDesign();
 * ```
 */
export function useDesign(): DesignContextValue {
    return useContext(DesignContext);
}
