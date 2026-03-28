/**
 * DesignStore — manages local customisation state with undo/redo.
 *
 * Provides state management for the interactive design editor,
 * including loading from server, local editing, and persistence.
 */

import {useCallback, useRef, useState} from 'react';

import type {Customisation} from '../types.js';

/** A snapshot of the customisation state for undo/redo. */
interface Snapshot {
    customisation: Customisation;
    timestamp: number;
}

/** Options for the design store. */
export interface DesignStoreOptions {
    /** Initial customisation loaded from the server. */
    initial: Customisation | null;
    /** Maximum undo history depth. */
    maxHistory?: number;
}

/**
 * Hook providing design-time customisation state with undo/redo.
 *
 * @example
 * ```tsx
 * const store = useDesignStore({ initial: serverCustomisation });
 * store.updateSchema('fieldName', { title: 'New Title' });
 * store.undo();
 * ```
 */
export function useDesignStore(options: DesignStoreOptions) {
    const {initial, maxHistory = 50} = options;

    const [customisation, setCustomisation] = useState<Customisation>(
        initial ?? {componentId: '', schema: {}, cards: {}, layouts: {}},
    );

    const undoStack = useRef<Snapshot[]>([]);
    const redoStack = useRef<Snapshot[]>([]);

    const pushUndo = useCallback(() => {
        undoStack.current.push({
            customisation: structuredClone(customisation),
            timestamp: Date.now(),
        });
        if (undoStack.current.length > maxHistory) {
            undoStack.current.shift();
        }
        redoStack.current = []; // Clear redo on new change
    }, [customisation, maxHistory]);

    const undo = useCallback(() => {
        const snapshot = undoStack.current.pop();
        if (!snapshot) return;

        redoStack.current.push({
            customisation: structuredClone(customisation),
            timestamp: Date.now(),
        });

        setCustomisation(snapshot.customisation);
    }, [customisation]);

    const redo = useCallback(() => {
        const snapshot = redoStack.current.pop();
        if (!snapshot) return;

        undoStack.current.push({
            customisation: structuredClone(customisation),
            timestamp: Date.now(),
        });

        setCustomisation(snapshot.customisation);
    }, [customisation]);

    const updateSchema = useCallback(
        (fieldName: string, overrides: Record<string, unknown>) => {
            pushUndo();
            setCustomisation(prev => ({
                ...prev,
                schema: {
                    ...prev.schema,
                    [fieldName]: {...(prev.schema?.[fieldName] ?? {}), ...overrides},
                },
            }));
        },
        [pushUndo],
    );

    const updateCard = useCallback(
        (cardId: string, overrides: Record<string, unknown>) => {
            pushUndo();
            setCustomisation(prev => {
                const existing = prev.cards?.[cardId] ?? {};
                const updated = {...existing, ...overrides};
                return {
                    ...prev,
                    cards: {
                        ...prev.cards,
                        [cardId]: updated,
                    } as Customisation['cards'],
                };
            });
        },
        [pushUndo],
    );

    const updateLayout = useCallback(
        (layoutKey: string, overrides: Record<string, unknown>) => {
            pushUndo();
            setCustomisation(prev => {
                const existing = prev.layouts?.[layoutKey] ?? {};
                const updated = {...existing, ...overrides};
                return {
                    ...prev,
                    layouts: {
                        ...prev.layouts,
                        [layoutKey]: updated,
                    } as Customisation['layouts'],
                };
            });
        },
        [pushUndo],
    );

    const moveFieldBetweenCards = useCallback(
        (fieldName: string, fromCardId: string, toCardId: string, toIndex: number) => {
            pushUndo();
            setCustomisation(prev => {
                const newCards = structuredClone(prev.cards ?? {});

                // Remove from source card
                const fromCard = newCards[fromCardId];
                if (fromCard?.widgets) {
                    fromCard.widgets = fromCard.widgets.filter(w =>
                        typeof w === 'string' ? w !== fieldName : !w.includes(fieldName),
                    );
                }

                // Add to target card
                const toCard = newCards[toCardId];
                if (toCard?.widgets) {
                    toCard.widgets.splice(toIndex, 0, fieldName);
                }

                return {...prev, cards: newCards};
            });
        },
        [pushUndo],
    );

    const reset = useCallback(() => {
        pushUndo();
        setCustomisation(initial ?? {componentId: '', schema: {}, cards: {}, layouts: {}});
    }, [initial, pushUndo]);

    return {
        customisation,
        setCustomisation,
        updateSchema,
        updateCard,
        updateLayout,
        moveFieldBetweenCards,
        undo,
        redo,
        reset,
        canUndo: undoStack.current.length > 0,
        canRedo: redoStack.current.length > 0,
        isDirty: JSON.stringify(customisation) !== JSON.stringify(initial),
    };
}
