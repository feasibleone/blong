/**
 * useDesignable — makes any component drag-and-drop and selection-aware in design mode.
 * Returns inert values when design mode is inactive — zero cost at runtime.
 *
 * Uses useDraggable + useDroppable instead of useSortable so that:
 * - No automatic sort animation happens (explicit, predictable UX).
 * - Drag data (type, label, sourceId, ...) can be passed to DropZone for validation.
 */
import {useDraggable, useDroppable} from '@dnd-kit/core';
import {useCallback, useMemo} from 'react';
import type {DesignElementType, IDesignElement} from './DesignModeContext.js';
import {useDesignMode} from './useDesignMode.js';

export interface IDesignableResult {
    isSelected: boolean;
    select: () => void;
    /** Drag event handlers (pointer listeners + aria attributes). Spread onto the drag element.
     *  Does NOT include a ref — use setRef for that. */
    dragProps: Record<string, unknown>;
    /** Combined drag+drop ref. Attach to the outermost DOM element of the draggable component.
     *  Null when design mode is inactive. */
    setRef: ((node: HTMLElement | null) => void) | null;
    designClass: string;
    style?: React.CSSProperties;
}

/**
 * @param id        - Unique drag/drop id (e.g. 'card-tree')
 * @param type      - Element type
 * @param extraData - Additional data stored in active.data.current during drag.
 *                    Include at minimum: { label, sourceId } so DropZone can validate.
 */
export function useDesignable(
    id: string,
    type: DesignElementType,
    extraData?: Record<string, unknown>,
): IDesignableResult {
    const {active, selected, select} = useDesignMode();

    const isSelected = selected?.id === id;

    const selectSelf = useCallback(() => {
        select({id, type} as IDesignElement);
    }, [id, type, select]);

    const data = useMemo(
        () => ({type, ...extraData}),
        // eslint-disable-next-line @eslint-react/exhaustive-deps
        [type, JSON.stringify(extraData)],
    );

    // Draggable — picks up the element
    const {
        attributes,
        listeners,
        setNodeRef: setDragRef,
        isDragging,
    } = useDraggable({
        id,
        disabled: !active,
        data,
    });

    // Droppable — same element receives other dragged items (drop-before behaviour)
    const {setNodeRef: setDropRef} = useDroppable({id, disabled: !active});

    // Combine both refs onto the same DOM node
    const setRef = useCallback(
        (node: Element | null) => {
            setDragRef(node as HTMLElement | null);
            setDropRef(node as HTMLElement | null);
        },
        [setDragRef, setDropRef],
    );

    if (!active) {
        return {
            isSelected: false,
            select: () => undefined,
            dragProps: {},
            setRef: null,
            designClass: '',
        };
    }

    const style: React.CSSProperties = {
        opacity: isDragging ? 0.4 : 1,
        // No CSS transform — the DragOverlay shows the ghost instead
    };

    const designClass = [
        'blong-designable',
        isSelected ? 'blong-designable--selected' : '',
        isDragging ? 'blong-designable--dragging' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return {
        isSelected,
        select: selectSelf,
        dragProps: {...attributes, ...listeners},
        setRef,
        designClass,
        style,
    };
}
