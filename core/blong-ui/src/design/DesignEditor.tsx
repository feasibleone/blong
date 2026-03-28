/**
 * DesignEditor — main overlay that activates design mode.
 *
 * Toggle button (⚙), toolbar with save/add card/add field actions,
 * trash zone, inspector panel. Integrates all design components.
 */

import React, {useCallback, useState} from 'react';

import type {BlongSchema, Cards, Customisation, Layout} from '../types.js';
import {DesignContext} from '../hooks/useDesign.js';
import type {DesignContextValue} from '../hooks/useDesign.js';
import {useDesignStore} from './DesignStore.js';
import {Inspector} from './Inspector.js';
import {SelectField} from './SelectField.js';
import {SelectCard} from './SelectCard.js';

/** Props for the DesignEditor component. */
export interface DesignEditorProps {
    /** The full schema. */
    schema: BlongSchema;
    /** Current cards configuration. */
    cards: Cards;
    /** Active layout. */
    layout: Layout;
    /** Initial customisation from the server. */
    customisation: Customisation | null;
    /** Called to save the customisation. */
    onSave: (customisation: Omit<Customisation, 'componentId'>) => void;
    /** Whether save is in progress. */
    isSaving?: boolean;
    /** The main content to wrap. */
    children: React.ReactNode;
}

/**
 * DesignEditor — overlay component activating design mode.
 *
 * @example
 * ```tsx
 * <DesignEditor
 *     schema={schema}
 *     cards={cards}
 *     layout={layout}
 *     customisation={serverCustomisation}
 *     onSave={saveCustomization}
 * >
 *     <FormCard ... />
 * </DesignEditor>
 * ```
 */
export function DesignEditor({
    schema,
    cards,
    layout,
    customisation,
    onSave,
    isSaving = false,
    children,
}: DesignEditorProps): React.ReactElement {
    const [isDesignMode, setIsDesignMode] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showSelectField, setShowSelectField] = useState(false);
    const [showSelectCard, setShowSelectCard] = useState(false);

    const store = useDesignStore({initial: customisation});

    const toggleDesignMode = useCallback(() => {
        setIsDesignMode(prev => !prev);
        setSelectedId(null);
    }, []);

    const handleSave = useCallback(() => {
        onSave({
            schema: store.customisation.schema,
            cards: store.customisation.cards,
            layouts: store.customisation.layouts,
        });
    }, [onSave, store.customisation]);

    const handlePropertyChange = useCallback(
        (updates: Record<string, unknown>) => {
            if (!selectedId) return;
            if (selectedId.startsWith('field:')) {
                const fieldName = selectedId.slice('field:'.length);
                store.updateSchema(fieldName, updates);
            } else if (selectedId.startsWith('card:')) {
                const cardId = selectedId.slice('card:'.length);
                store.updateCard(cardId, updates);
            }
        },
        [selectedId, store],
    );

    // Get properties for the selected element
    const selectedProperties = (() => {
        if (!selectedId) return {};
        if (selectedId.startsWith('field:')) {
            const fieldName = selectedId.slice('field:'.length);
            return {
                ...(schema.properties?.[fieldName] ?? {}),
                ...(store.customisation.schema?.[fieldName] ?? {}),
            };
        }
        if (selectedId.startsWith('card:')) {
            const cardId = selectedId.slice('card:'.length);
            return {
                ...(cards[cardId] ?? {}),
                ...(store.customisation.cards?.[cardId] ?? {}),
            };
        }
        return {};
    })();

    const contextValue: DesignContextValue = {
        isDesignMode,
        toggleDesignMode,
        selectedId,
        setSelectedId,
        customisation: store.customisation,
        setCustomisation: (update) => {
            if (update.schema) {
                for (const [key, val] of Object.entries(update.schema)) {
                    store.updateSchema(key, val as Record<string, unknown>);
                }
            }
        },
        save: handleSave,
        isSaving,
        undo: store.undo,
        redo: store.redo,
        canUndo: store.canUndo,
        canRedo: store.canRedo,
    };

    // Design mode toggle button (always visible)
    const toggleButton = React.createElement(
        'button',
        {
            className: `blong-design-toggle ${isDesignMode ? 'blong-design-toggle-active' : ''}`,
            onClick: toggleDesignMode,
            title: isDesignMode ? 'Exit design mode' : 'Enter design mode',
        },
        '⚙',
    );

    // Design toolbar (visible in design mode)
    const toolbar = isDesignMode
        ? React.createElement(
              'div',
              {className: 'blong-design-toolbar'},
              React.createElement(
                  'button',
                  {
                      className: 'blong-btn blong-btn-primary',
                      onClick: handleSave,
                      disabled: !store.isDirty || isSaving,
                  },
                  isSaving ? 'Saving...' : 'Save',
              ),
              React.createElement(
                  'button',
                  {
                      className: 'blong-btn',
                      onClick: () => setShowSelectCard(true),
                  },
                  '+ Card',
              ),
              React.createElement(
                  'button',
                  {
                      className: 'blong-btn',
                      onClick: () => setShowSelectField(true),
                  },
                  '+ Field',
              ),
              React.createElement(
                  'button',
                  {
                      className: 'blong-btn',
                      onClick: store.undo,
                      disabled: !store.canUndo,
                  },
                  '↶ Undo',
              ),
              React.createElement(
                  'button',
                  {
                      className: 'blong-btn',
                      onClick: store.redo,
                      disabled: !store.canRedo,
                  },
                  '↷ Redo',
              ),
              React.createElement(
                  'button',
                  {
                      className: 'blong-btn blong-btn-secondary',
                      onClick: store.reset,
                  },
                  'Reset',
              ),
          )
        : null;

    // Inspector panel (visible in design mode when something is selected)
    const inspector =
        isDesignMode && selectedId
            ? React.createElement(Inspector, {
                  properties: selectedProperties,
                  onChange: handlePropertyChange,
                  className: 'blong-design-inspector',
              })
            : null;

    // Trash drop zone
    const trashZone = isDesignMode
        ? React.createElement('div', {
              className: 'blong-design-trash',
              onDragOver: (e: React.DragEvent) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
              },
              onDrop: (e: React.DragEvent) => {
                  e.preventDefault();
                  const data = e.dataTransfer.getData('text/plain');
                  // Handle field/card removal
                  if (data.startsWith('field:') || data.startsWith('card:')) {
                      // Trigger removal through the store
                      // This would be connected to actual removal logic
                  }
              },
              children: '🗑 Drop here to remove',
          })
        : null;

    return React.createElement(
        DesignContext.Provider,
        {value: contextValue},
        React.createElement(
            'div',
            {className: `blong-design-editor ${isDesignMode ? 'blong-design-mode' : ''}`},
            toggleButton,
            toolbar,
            React.createElement(
                'div',
                {className: 'blong-design-content'},
                children,
                inspector,
            ),
            trashZone,
            React.createElement(SelectField, {
                schema,
                cards,
                onSelect: (fieldName) => {
                    // Add field to the first card in the layout
                    const firstCardId = layout.cards[0];
                    if (firstCardId) {
                        store.updateCard(firstCardId, {
                            widgets: [...(cards[firstCardId]?.widgets ?? []), fieldName],
                        });
                    }
                },
                onClose: () => setShowSelectField(false),
                visible: showSelectField,
            }),
            React.createElement(SelectCard, {
                cards,
                layout,
                onSelect: (cardId) => {
                    store.updateLayout('edit', {
                        cards: [...layout.cards, cardId],
                    });
                },
                onClose: () => setShowSelectCard(false),
                visible: showSelectCard,
            }),
        ),
    );
}
