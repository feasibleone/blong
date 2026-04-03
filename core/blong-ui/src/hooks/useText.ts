/**
 * useText — i18n text lookup.
 */
import {useAppStore} from '../state/appStore.js';

/**
 * Returns translated text for the given key.
 * Falls back to the key itself if no translation is found.
 *
 * @param id - Translation key (e.g. 'buttons.save')
 * @param params - Interpolation parameters (e.g. {name: 'Alice'})
 */
export function useText(id: string, params?: Record<string, string | number>): string {
    const translations = useAppStore(s => s.translations);
    let text = translations[id] ?? id;
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
        }
    }
    return text;
}
