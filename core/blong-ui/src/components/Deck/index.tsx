/**
 * Deck — horizontal grouping of cards.
 * Multiple decks stack vertically.
 */
import {type ReactNode} from 'react';
import {DropZone} from '../../design/DropZone.js';
import {useDesignMode} from '../../design/useDesignMode.js';

export interface IDeckProps {
    id: string;
    children: ReactNode;
    readOnly?: boolean;
    loading?: boolean;
    className?: string;
}

export function Deck({id, children, className}: IDeckProps) {
    const {active: isDesignMode} = useDesignMode();

    return (
        <div className={['blong-deck', className ?? ''].filter(Boolean).join(' ')}>
            {isDesignMode && (
                <DropZone
                    id={`drop:deck-before:${id}`}
                    orientation="vertical"
                />
            )}
            {children}
            {isDesignMode && (
                <DropZone
                    id={`drop:deck-after:${id}`}
                    orientation="vertical"
                />
            )}
        </div>
    );
}
