/**
 * useDesignable — makes any component drag-and-drop and selection-aware in design mode.
 * Returns inert values when design mode is inactive — zero cost at runtime.
 */
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {useCallback} from 'react';
import type {DesignElementType, IDesignElement} from './DesignModeContext.js';
import {useDesignMode} from './useDesignMode.js';

export interface IDesignableResult {
    isSelected: boolean;
    select: () => void;
    dragProps: Record<string, unknown>;
    designClass: string;
    style?: React.CSSProperties;
}

/**
 * @param id - Uniquely identifies this element (e.g. 'card:identification')
 * @param type - Element type
 */
export function useDesignable(id: string, type: DesignElementType): IDesignableResult {
    const {active, selected, select} = useDesignMode();

    const isSelected = selected?.id === id;

    const selectSelf = useCallback(() => {
        select({id, type} as IDesignElement);
    }, [id, type, select]);

    // dnd-kit sortable — only active in design mode
    const sortable = useSortable({id, disabled: !active});
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = sortable;

    if (!active) {
        return {
            isSelected: false,
            select: () => undefined,
            dragProps: {},
            designClass: '',
        };
    }

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
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
        dragProps: {...attributes, ...listeners, ref: setNodeRef},
        designClass,
        style,
    };
}
