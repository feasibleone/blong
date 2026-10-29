/**
 * useDrag.ts — pointer deltas for the mode's own boxes (`@@T-489`).
 *
 * One implementation for the callout's bevel, its corner, and the crop rectangle:
 * every one of them reports "this much since the last frame" and lets the owner
 * decide what to do with it. Deltas come from the previous pointer position
 * rather than the grab point, so a box that a clamp stopped for a frame follows
 * the pointer again as soon as it can.
 */

import {useCallback, useRef, type PointerEvent} from 'react';

export interface IDrag {
    start: (event: PointerEvent<HTMLElement>) => void;
}

export function useDrag(onDelta: (dx: number, dy: number) => void): IDrag {
    const lastRef = useRef<{x: number; y: number} | null>(null);
    const start = useCallback(
        (event: PointerEvent<HTMLElement>) => {
            // A drag must not select the text underneath or focus the editor the
            // box is about, and it must not reach the guard.
            event.preventDefault();
            event.stopPropagation();
            lastRef.current = {x: event.clientX, y: event.clientY};
            const node = event.currentTarget;
            // A capture is a convenience, not the mechanism: the listeners below are on
            // the node itself. A synthetic pointer (a story or a test) has no active
            // pointer id, and the call throws for it (`@@T-498`).
            try {
                node.setPointerCapture?.(event.pointerId);
            } catch {
                // No capture to take; the drag still runs on this node.
            }
            const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
                const previous = lastRef.current;
                if (!previous) return;
                const dx = moveEvent.clientX - previous.x;
                const dy = moveEvent.clientY - previous.y;
                lastRef.current = {x: moveEvent.clientX, y: moveEvent.clientY};
                if (dx || dy) onDelta(dx, dy);
            };
            const end = () => {
                lastRef.current = null;
                node.removeEventListener('pointermove', onPointerMove);
                node.removeEventListener('pointerup', end);
                node.removeEventListener('pointercancel', end);
            };
            node.addEventListener('pointermove', onPointerMove);
            node.addEventListener('pointerup', end);
            node.addEventListener('pointercancel', end);
        },
        [onDelta],
    );
    return {start};
}
