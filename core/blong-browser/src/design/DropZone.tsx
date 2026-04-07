/**
 * DropZone — space-reserving drop target shown in design mode.
 *
 * - Always occupies space (prevents reflow during drag).
 * - Shows the dragged item's label for ALL valid zones during a drag (not just on hover).
 * - Hides (becomes invisible) when the drag type doesn't match or it's
 *   the same-source column/card (invalid target).
 */
import { useDndContext, useDroppable } from '@dnd-kit/core';
import { useDesignMode } from './useDesignMode.js';

export interface IDropZoneProps {
    id: string;
    /** What drag type this zone accepts: 'card' to receive dragged cards,
     *  'field' to receive dragged field rows. */
    accept: 'card' | 'field';
    /**
     * The "source" identifier used to reject same-origin drops:
     * - For card zones: the column index (number) — reject if active.data.colIdx === sourceId.
     * - For field zones: the card name (string)   — reject if active.data.cardName === sourceId.
     */
    sourceId?: string | number;
}

export function DropZone({id, accept, sourceId}: IDropZoneProps) {
    const {active: isDesignActive} = useDesignMode();
    const {active: dragging} = useDndContext();
    const {isOver, setNodeRef} = useDroppable({id});

    if (!isDesignActive) return null;

    const dragType = dragging?.data?.current?.type as string | undefined;
    const dragSourceId = dragging?.data?.current?.sourceId as string | number | undefined;
    const dragLabel = dragging?.data?.current?.label as string | undefined;

    // Valid when: drag type matches AND the drag source is different from this zone's source
    const isValid = !!dragging && dragType === accept && dragSourceId !== sourceId;

    return (
        <div
            ref={setNodeRef}
            className={[
                'blong-drop-zone',
                `blong-drop-zone--${accept}`,
                !dragging ? '' : isValid ? 'blong-drop-zone--valid' : 'blong-drop-zone--hidden',
                isOver && isValid ? 'blong-drop-zone--over' : '',
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {isValid && dragLabel && (
                <span className="blong-drop-zone__label">+ {dragLabel}</span>
            )}
        </div>
    );
}
