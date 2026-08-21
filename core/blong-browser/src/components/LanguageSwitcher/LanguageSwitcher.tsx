import './LanguageSwitcher.css';

import {useMemo} from 'react';
import {Dropdown} from '../../primereact/index.js';
import {useAppStore} from '../../state/appStore.js';

/** A selectable UI language — `value` matches the translation-dictionary key. */
export interface ILanguageOption {
    value: string;
    label: string;
}

export interface ILanguageSwitcherProps {
    /**
     * Explicit language list — wins over the portal config
     * (`config.portal.languages`).  When neither is set, the switcher falls
     * back to the keys of the configured translation dictionaries.
     */
    languages?: ILanguageOption[];
}

/**
 * LanguageSwitcher — the configurable UI-language selector in the portal
 * menubar, rendered to the left of the profile menu.
 *
 * It offers ad-hoc (client-side) switching: selecting a language calls
 * `appStore.setLanguage`, which swaps the active translation dictionary and
 * activates the matching PrimeReact locale.  The choice is NOT persisted to
 * the user profile — that is the profile page's `preferredLanguage` edit.
 *
 * The available languages are config-driven (`config.portal.languages`), with
 * a fallback to the keys of `config.portal.translations`.  When fewer than
 * two languages are configured the switcher renders nothing.
 */
export function LanguageSwitcher({languages: languagesProp}: ILanguageSwitcherProps) {
    const language = useAppStore(s => s.language);
    const setLanguage = useAppStore(s => s.setLanguage);
    const portalConfig = useAppStore(s => s.portal.portalConfig);

    // Config wins (prop → portal config), then fall back to the configured
    // translation-dictionary keys so any app with translations gets a switcher
    // without extra config.
    const languages = useMemo<ILanguageOption[]>(() => {
        const configured = languagesProp ?? portalConfig?.languages;
        if (configured && configured.length) return configured;
        const dicts = portalConfig?.translations;
        if (dicts) {
            return Object.keys(dicts).map(value => ({value, label: value}));
        }
        return [];
    }, [languagesProp, portalConfig?.languages, portalConfig?.translations]);

    // Nothing to switch between — hide the selector.
    if (languages.length < 2) return null;

    return (
        <Dropdown
            value={language}
            options={languages}
            optionLabel="label"
            optionValue="value"
            onChange={e => setLanguage(e.value as string)}
            className="blong-language-switcher"
            panelClassName="blong-language-switcher__panel"
            aria-label="Language"
        />
    );
}
