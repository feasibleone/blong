/**
 * I18nProvider — internationalisation support for the browser UI.
 *
 * Provides label translation and RTL support. Uses a simple key-value
 * translation map that can be loaded from the server or bundled statically.
 */

import React, {createContext, useCallback, useContext, useMemo} from 'react';

/** Supported text directions. */
export type TextDirection = 'ltr' | 'rtl';

/** A translation dictionary: key → translated string. */
export type TranslationMap = Record<string, string>;

/** I18n context value. */
export interface I18nContextValue {
    /** Current locale code (e.g., 'en', 'ar', 'bg'). */
    locale: string;
    /** Text direction. */
    direction: TextDirection;
    /** Translate a key, with optional parameter substitution. */
    t: (key: string, params?: Record<string, string | number>) => string;
    /** All loaded translations. */
    translations: TranslationMap;
}

const defaultI18n: I18nContextValue = {
    locale: 'en',
    direction: 'ltr',
    t: (key: string) => key,
    translations: {},
};

export const I18nContext = createContext<I18nContextValue>(defaultI18n);

/** Props for the I18nProvider component. */
export interface I18nProviderProps {
    children: React.ReactNode;
    /** Locale code. */
    locale: string;
    /** Text direction (default: 'ltr'). */
    direction?: TextDirection;
    /** Translation dictionary. */
    translations?: TranslationMap;
}

/**
 * Substitute parameters in a translated string.
 * Parameters are referenced as `{paramName}`.
 */
function substituteParams(
    template: string,
    params?: Record<string, string | number>,
): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, key) =>
        params[key] != null ? String(params[key]) : `{${key}}`,
    );
}

/**
 * I18nProvider — provides translations and text direction to the component tree.
 *
 * @example
 * ```tsx
 * <I18nProvider locale="en" translations={enTranslations}>
 *     <App />
 * </I18nProvider>
 * ```
 */
export function I18nProvider({
    children,
    locale,
    direction = 'ltr',
    translations = {},
}: I18nProviderProps): React.ReactElement {
    const t = useCallback(
        (key: string, params?: Record<string, string | number>): string => {
            const translated = translations[key] ?? key;
            return substituteParams(translated, params);
        },
        [translations],
    );

    const value = useMemo<I18nContextValue>(
        () => ({locale, direction, t, translations}),
        [locale, direction, t, translations],
    );

    return React.createElement(I18nContext.Provider, {value}, children);
}

/**
 * Hook to access the i18n context.
 *
 * @example
 * ```tsx
 * const { t, direction } = useI18n();
 * return <div dir={direction}>{t('greeting', { name: 'Alice' })}</div>;
 * ```
 */
export function useI18n(): I18nContextValue {
    return useContext(I18nContext);
}
