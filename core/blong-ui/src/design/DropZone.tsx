/**
 * DropZone — visual insertion point between draggable elements.
 */
import {useDroppable} from '@dnd-kit/core';
import {useDesignMode} from './useDesignMode.js';

interface IDropZoneProps {
    id: string;
    orientation?: 'horizontal' | 'vertical';
}

export function DropZone({id, orientation = 'horizontal'}: IDropZoneProps) {
    const {active} = useDesignMode();
    const {isOver, setNodeRef} = useDroppable({id});

    if (!active) return null;

    return (
        <div
            ref={setNodeRef}
            className={[
                'blong-drop-zone',
                `blong-drop-zone--${orientation}`,
                isOver ? 'blong-drop-zone--over' : '',
            ]
                .filter(Boolean)
                .join(' ')}
            aria-label="Drop zone"
        />
    );
}
