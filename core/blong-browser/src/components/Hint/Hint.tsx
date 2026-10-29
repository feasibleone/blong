/**
 * Hint — transient success/error toast notifications.
 *
 * Also exports ActionHint — singleton OverlayPanel for ActionButton
 * success/error feedback anchored near the triggering button.
 */
import {OverlayPanel, Toast} from '../../primereact/index.js';

import {useEffect, useRef} from 'react';
import {useFeedbackFreeze} from '../../feedback/useFeedbackFreeze.js';
import {useFeedbackActive} from '../../feedback/useFeedbackTarget.js';
import {useAppStore} from '../../state/appStore.js';

export function Hint() {
    const toastRef = useRef<Toast>(null);
    const toasts = useAppStore(s => s.toasts);
    const feedbackActive = useFeedbackActive();
    const lastToastRef = useRef<{summary?: string; detail?: unknown; severity: string} | null>(
        null,
    );

    useEffect(() => {
        if (toastRef.current && toasts.length > 0) {
            const latest = toasts[toasts.length - 1];
            lastToastRef.current = latest;
            toastRef.current.show({
                severity: latest.severity,
                summary: latest.summary,
                detail: latest.detail,
                // A PrimeReact toast's life cannot be paused, so a toast raised
                // while feedback mode is on is shown with a long fixed lifetime
                // instead — the closest thing to a freeze the component offers
                // (`@@T-465`).
                life: feedbackActive ? 24 * 60 * 60 * 1000 : latest.life,
            });
        }
    }, [toasts, feedbackActive]);

    return (
        <Toast
            ref={toastRef}
            position="top-right"
        />
    );
}

/**
 * ActionHint — singleton OverlayPanel for button-level feedback.
 * Mount once in App. ActionButton calls showHint() to display a
 * success/error message anchored to the button. Auto-dismisses after 2 s.
 */
export function ActionHint() {
    const hint = useAppStore(s => s.hint);
    const clearHint = useAppStore(s => s.clearHint);
    const overlayRef = useRef<OverlayPanel>(null);

    useEffect(() => {
        if (hint?.target) overlayRef.current?.show(null, hint.target);
        else overlayRef.current?.hide();
    }, [hint]);

    // Two seconds, held while feedback mode is on (`@@T-465`). A new hint restarts
    // the lifetime; the mode only pauses it.
    useFeedbackFreeze(
        2000,
        () => {
            overlayRef.current?.hide();
            clearHint();
        },
        Boolean(hint?.target),
        hint,
    );

    return (
        <OverlayPanel
            ref={overlayRef}
            style={{maxWidth: 240}}
        >
            <span className={hint?.error ? 'text-red-500' : 'text-green-500'}>{hint?.message}</span>
        </OverlayPanel>
    );
}
