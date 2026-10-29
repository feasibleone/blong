/**
 * guard.ts — how the mode freezes the UI (`@@T-465`, `@@D-659`).
 *
 * One capture-phase listener set on the document, installed only while the mode
 * is active. It stops the events PrimeReact uses to close an overlay or run a menu
 * command from ever reaching it, and `preventDefault` keeps focus where it is so a
 * `Dropdown` does not blur either. Nothing in the component tree has to know the
 * mode exists.
 *
 * Events that start inside the mode's own chrome (`[data-feedback-ui]`) pass
 * through untouched, so typing in a callout and pressing its buttons work. Escape
 * is swallowed everywhere else — a menu closes on it, and a menu that closes is
 * exactly what the mode must prevent.
 *
 * A hover-only affordance (a tooltip) cannot survive the pointer leaving the
 * element, so it is not frozen; the element's `title` attribute is copied into the
 * item instead.
 */

import {closestFeedbackTarget, isFeedbackUi} from './ids.js';

export interface IFeedbackGuardOptions {
    /** Called when a click lands on an addressable element. */
    onTargetClick: (element: HTMLElement, event: MouseEvent) => void;
}

const POINTER_EVENTS = ['pointerdown', 'mousedown', 'touchstart'] as const;

/**
 * Install the guard; the returned function removes it.
 *
 * Must be called only while the mode is active — installing it permanently would
 * stop the whole application from responding to clicks.
 */
export function installFeedbackGuard({onTargetClick}: IFeedbackGuardOptions): () => void {
    if (typeof document === 'undefined') return () => undefined;

    const stop = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        // PrimeReact attaches some listeners to the same node we do; without this
        // a sibling capture listener still sees the event.
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    };

    const onPointer = (event: Event): void => {
        if (isFeedbackUi(event.target)) return;
        if (closestFeedbackTarget(event.target)) stop(event);
    };

    const onClick = (event: MouseEvent): void => {
        if (isFeedbackUi(event.target)) return;
        const element = closestFeedbackTarget(event.target);
        if (!element) return;
        stop(event);
        onTargetClick(element, event);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
        if (isFeedbackUi(event.target)) return;
        // Every key is swallowed outside the chrome: a shortcut that opens a dialog,
        // a table that pages on an arrow, a menu that closes on Escape.
        stop(event);
    };

    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('touchstart', onPointer, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
        for (const name of POINTER_EVENTS) document.removeEventListener(name, onPointer, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
    };
}
