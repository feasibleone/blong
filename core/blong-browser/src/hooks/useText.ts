/**
 * useText — i18n text lookup.
 */
import {useCallback} from 'react';
import {useAppStore} from '../state/appStore.js';

/**
 * Returns translated text for the given key.
 * Falls back to the key itself if no translation is found.
 *
 * @param id - Translation key (e.g. 'buttons.save') or raw English text
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

/**
 * useTranslate — returns a stable `t(text)` function for use outside JSX.
 * The returned function looks up the text in the translations store,
 * falling back to the original text.
 */
export function useTranslate(): (text: string) => string {
    const translations = useAppStore(s => s.translations);
    return useCallback((text: string) => translations[text] ?? text, [translations]);
}
