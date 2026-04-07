/**
 * useLoader — control the global loading overlay.
 */
import {useAppStore} from '../state/appStore.js';

export interface IUseLoaderResult {
    loading: boolean;
    message?: string;
    setLoading: (active: boolean, message?: string) => void;
}

export function useLoader(): IUseLoaderResult {
    const {active, message} = useAppStore(s => s.loader);
    const setLoading = useAppStore(s => s.setLoading);
    return {loading: active, message, setLoading};
}
