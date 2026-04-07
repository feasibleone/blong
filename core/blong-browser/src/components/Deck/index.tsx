/**
 * Deck — column group of stacked cards.
 *
 * Two modes:
 *
 * 1. **Context-driven** (`cardNames` prop): resolves cards from the nearest
 *    Form's FormContext, applies permission/match/hidden filtering, renders
 *    hidden inputs for invisible cards, and stacks visible Card components.
 *    This is the normal mode inside a Form.
 *
 * 2. **Passthrough** (no `cardNames`): renders `children` as-is with mb-3
 *    spacing applied to every non-last child. Used for standalone layouts
 *    and tests.
 *
 * In both modes, design-mode DropZones are shown above and below the deck
 * when the DesignModeContext is active.
 */
import React, {type ReactNode} from 'react';
import {Controller} from 'react-hook-form';
import {DropZone} from '../../design/DropZone.js';
import {useDesignMode} from '../../design/useDesignMode.js';
import {Card} from '../Card/index.js';
import {useBlongForm} from '../Form/FormContext.js';

export interface IDeckProps {
    id: string;
    /** When provided, renders these cards from FormContext (context-driven mode). */
    cardNames?: string[];
    /**
     * Card names to render as hidden inputs only (hidden: true in card config).
     * Only used in context-driven mode.
     */
    hiddenCardNames?: string[];
    /** Passthrough children — used when cardNames is not provided. */
    children?: ReactNode;
    readOnly?: boolean;
    loading?: boolean;
    className?: string;
}

export function Deck({id, cardNames, hiddenCardNames, children, className}: IDeckProps) {
    const {active: isDesignMode} = useDesignMode();
    const formCtx = useBlongForm();

    // Extract the column index from id ('deck-0', 'deck-1', ...) for DnD
    const colIdx = parseInt(id.replace(/^deck-/, ''), 10);

    let body: ReactNode;

    if (cardNames !== undefined && formCtx) {
        // Context-driven mode — filter and render cards
        const {cards, tableSelections, checkPermission, control, schema} = formCtx;

        const visibleCards = cardNames.filter(name => {
            const resolved = cards[name];
            if (!resolved) return false;
            if (resolved.config.permission !== undefined) {
                return !!checkPermission?.(resolved.config.permission);
            }
            // Match-based polymorphic card: only show when the watched selection matches
            if (resolved.config.match) {
                const rawWatch = resolved.config.watch;
                const watchField = rawWatch?.startsWith('$.selected.')
                    ? rawWatch.slice('$.selected.'.length)
                    : rawWatch;
                if (!watchField) return false;
                const selection = tableSelections[watchField];
                if (!selection) return false;
                return Object.entries(resolved.config.match).every(
                    ([k, v]) => selection.row[k] === v,
                );
            }
            return true;
        });

        // Hidden cards — render only as hidden <input> elements so form values
        // for those fields are still registered with react-hook-form.
        const hiddenInputs = (hiddenCardNames ?? []).flatMap(cardName => {
            const resolved = cards[cardName];
            if (!resolved) return [];
            return resolved.fields.map(fieldName => {
                const fieldSchema = schema?.properties?.[fieldName];
                if (!fieldSchema) return null;
                return (
                    <Controller
                        key={fieldName}
                        name={fieldName}
                        control={control}
                        render={({field}) => (
                            <input
                                type="hidden"
                                name={fieldName}
                                value={field.value != null ? String(field.value) : ''}
                            />
                        )}
                    />
                );
            });
        });

        if (!visibleCards.length && !hiddenInputs.length) return null;

        // Apply mb-3 to every visible card except the last
        const cardElements = visibleCards.map((cardName, idx) => {
            const isLast = idx === visibleCards.length - 1;
            return (
                <Card
                    key={cardName}
                    cardName={cardName}
                    colIdx={colIdx}
                    className={isLast ? 'w-full' : 'w-full mb-3'}
                />
            );
        });

        body = (
            <>
                {hiddenInputs.length > 0 && <div style={{display: 'none'}}>{hiddenInputs}</div>}
                {cardElements}
            </>
        );
    } else {
        // Passthrough mode — add mb-3 to every child except the last
        const childArray = React.Children.toArray(children);
        body = childArray.map((child, idx) => {
            const isLast = idx === childArray.length - 1;
            if (isLast || !React.isValidElement(child)) return child;
            const currentClass = (child.props as {className?: string}).className ?? '';
            return React.cloneElement(child as React.ReactElement<{className?: string}>, {
                className: [currentClass, 'mb-3'].filter(Boolean).join(' '),
            });
        });
    }

    return (
        <div className={['blong-deck', className ?? ''].filter(Boolean).join(' ')}>
            {body}
            {isDesignMode && (
                <DropZone
                    id={`col-end:${colIdx}`}
                    accept="card"
                    sourceId={colIdx}
                />
            )}
        </div>
    );
}
