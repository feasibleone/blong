/**
 * Hint — transient success/error toast notifications.
 *
 * Also exports ActionHint — singleton OverlayPanel for ActionButton
 * success/error feedback anchored near the triggering button.
 */
import {OverlayPanel} from 'primereact/overlaypanel';
import {Toast} from 'primereact/toast';
import {useEffect, useRef} from 'react';
import {useAppStore} from '../../state/appStore.js';

export function Hint() {
    const toastRef = useRef<Toast>(null);
    const toasts = useAppStore(s => s.toasts);

    useEffect(() => {
        if (toastRef.current && toasts.length > 0) {
            const latest = toasts[toasts.length - 1];
            toastRef.current.show({
                severity: latest.severity,
                summary: latest.summary,
                detail: latest.detail,
                life: latest.life,
            });
        }
    }, [toasts]);

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
        if (hint?.target) {
            overlayRef.current?.show(null, hint.target);
            const t = setTimeout(() => {
                overlayRef.current?.hide();
                clearHint();
            }, 2000);
            return () => clearTimeout(t);
        } else {
            overlayRef.current?.hide();
        }
    }, [hint, clearHint]);

    return (
        <OverlayPanel
            ref={overlayRef}
            style={{maxWidth: 240}}
        >
            <span className={hint?.error ? 'text-red-500' : 'text-green-500'}>{hint?.message}</span>
        </OverlayPanel>
    );
}
