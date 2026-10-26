/**
 * useText - i18n text lookup, and the collector's only recording point.
 *
 * Everything translatable renders through here (`<Text>`, the `Button` wrapper,
 * the option helpers), so "what the screen asked for" is answerable in one place
 * and does not depend on a regex over the source (`D-625`).
 */
import {useCallback} from 'react';
import {recordRendered} from '../i18n/collect.js';
import {useAppStore} from '../state/appStore.js';

/**
 * Returns translated text for the given key.
 * Falls back to the key itself if no translation is found.
 *
 * @param id - Translation key (e.g. 'buttons.save') or raw English text
 * @param params - Interpolation parameters (e.g. {name: 'Alice'})
 */
export function useText(
    id: string | undefined,
    params?: Record<string, string | number | undefined>,
): string | undefined {
    const translations = useAppStore(s => s.translations);
    if (!id || typeof id !== 'string') return id;
    // A key rendered while the collector is on is what a translation seed needs,
    // whether or not the dictionary answered it - the report decides which.
    recordRendered(id);
    let text = translations[id] ?? id;
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
        }
    }
    return text;
}

export function usePlaceholder(text: string | undefined): {placeholder: string} | object {
    const placeholder = useText(text);
    return placeholder ? {placeholder} : {};
}

/**
 * useTranslate — returns a stable `t(text)` function for use outside JSX.
 * The returned function looks up the text in the translations store,
 * falling back to the original text.
 */
export function useTranslate(): (text: string | undefined) => string | undefined {
    const translations = useAppStore(s => s.translations);
    return useCallback(
        (text: string | undefined) => {
            if (text) recordRendered(text);
            return (text && translations[text]) ?? text;
        },
        [translations],
    );
}

/**
 * useOptionLabel - the label of a _static_ option, translated.
 *
 * Only a label the model declares (`options: [{label: 'Female'}]`) is a
 * dictionary key. An option the server produced is data: it arrives already
 * translated, in the language the read was asked for, and is rendered as it
 * came — translating it here a second time would let a dictionary key collide
 * with a record's name (`D-635`).
 */
export function useOptionLabel(): (option: {value?: unknown; label?: string}) => string {
    const translations = useAppStore(s => s.translations);
    return useCallback(
        (option: {value?: unknown; label?: string}) => {
            const label = option?.label ?? '';
            recordRendered(label);
            return translations[label] ?? label;
        },
        [translations],
    );
}

/**
 * translatedLabel - the dictionary's answer for a label, for a render path that is
 * a plain function rather than a component.
 *
 * `renderBody` in the table is called from the table's render, so it cannot call a
 * hook and reads the current store instead. It is only for a label the model
 * declares (a static option list); a label that came with a row is data and is
 * rendered as it arrived (`D-635`).
 */
export function translatedLabel(label: string): string {
    return useAppStore.getState().translations[label] ?? label;
}
