/**
 * useToast — show toast notifications.
 */
import {useAppStore, type IToast} from '../state/appStore.js';

export interface IUseToastResult {
    show: (toast: Omit<IToast, 'id'>) => void;
    success: (message: string, detail?: string) => void;
    error: (message: string, detail?: string) => void;
    info: (message: string, detail?: string) => void;
    warn: (message: string, detail?: string) => void;
    clear: (id: string) => void;
    clearAll: () => void;
}

export function useToast(): IUseToastResult {
    const showToast = useAppStore(s => s.showToast);
    const clearToast = useAppStore(s => s.clearToast);
    const clearAllToasts = useAppStore(s => s.clearAllToasts);

    return {
        show: showToast,
        success: (summary, detail) => showToast({severity: 'success', summary, detail}),
        error: (summary, detail) => showToast({severity: 'error', summary, detail}),
        info: (summary, detail) => showToast({severity: 'info', summary, detail}),
        warn: (summary, detail) => showToast({severity: 'warn', summary, detail}),
        clear: clearToast,
        clearAll: clearAllToasts,
    };
}
