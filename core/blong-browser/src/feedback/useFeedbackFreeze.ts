/**
 * useFeedbackFreeze.ts — a timer that waits while the mode is on (`@@T-465`).
 *
 * `ActionHint` hides itself after two seconds. Entering feedback mode in that
 * window must not lose the message, so the timer pauses with its remaining time
 * intact and resumes when the mode ends. The alternative — blocking the mode until
 * the hint expires — would make the switch feel broken instead.
 */

import {useEffect, useRef} from 'react';

import {useFeedbackActive} from './useFeedbackTarget.js';

/**
 * Run `onElapsed` after `delay` ms, holding the clock while feedback mode is
 * active.
 *
 * @param delay    the full lifetime, in milliseconds
 * @param onElapsed called once per expiry
 * @param enabled  schedule anything at all; `false` disables the timer entirely
 * @param resetKey a value that identifies the thing being timed — a new hint
 *                 restarts the full lifetime when this changes
 */
export function useFeedbackFreeze(
    delay: number,
    onElapsed: () => void,
    enabled = true,
    resetKey?: unknown,
): void {
    const active = useFeedbackActive();
    const callbackRef = useRef(onElapsed);
    callbackRef.current = onElapsed;
    const remainingRef = useRef(delay);
    const startedRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const keyRef = useRef<unknown>(resetKey);

    useEffect(() => {
        if (!enabled) return;
        if (keyRef.current !== resetKey) {
            keyRef.current = resetKey;
            remainingRef.current = delay;
            startedRef.current = null;
        }
        if (active) {
            // Pause: keep what is left of the lifetime for the resume below.
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            if (startedRef.current != null) {
                remainingRef.current = Math.max(
                    0,
                    remainingRef.current - (Date.now() - startedRef.current),
                );
                startedRef.current = null;
            }
            return;
        }
        startedRef.current = Date.now();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            startedRef.current = null;
            callbackRef.current();
        }, remainingRef.current);
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            if (startedRef.current != null) {
                remainingRef.current = Math.max(
                    0,
                    remainingRef.current - (Date.now() - startedRef.current),
                );
                startedRef.current = null;
            }
        };
    }, [active, enabled, delay, resetKey]);
}
