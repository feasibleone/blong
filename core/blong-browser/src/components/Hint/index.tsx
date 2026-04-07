/**
 * Hint — transient success/error toast notifications.
 */
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
