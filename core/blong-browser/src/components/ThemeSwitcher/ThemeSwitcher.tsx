import './ThemeSwitcher.css';

import {useMemo} from 'react';
import {Dropdown, SelectButton} from '../../primereact/index.js';
import {useText} from '../../hooks/useText.js';
import {useTheme, type PaletteType} from '../Theme/Theme.js';
import {THEME_GROUPS} from '../Theme/themeRegistry.js';

/** A light/dark option rendered by the palette toggle. */
interface IPaletteMode {
    value: PaletteType;
    label: string;
    icon: string;
}

export interface IThemeSwitcherProps {
    /** Extra class name for the wrapper. */
    className?: string;
}

/**
 * ThemeSwitcher — the theme selector shown in the portal menubar, to the left
 * of the language switcher.
 *
 * Lets the user switch to any PrimeReact theme family (light/dark variants of
 * the same family share one entry) or to a blong-browser visual variant (Glass,
 * Wood). When the selected theme provides both a light and a dark variant, a
 * segmented Light/Dark toggle appears next to the dropdown.
 *
 * The choice is written to `appStore.setTheme` (persisted to localStorage) and
 * applied by the `<Theme>` provider. Render it inside `<Theme>` so `useTheme()`
 * has the effective theme.
 *
 * Renders nothing when `IThemeConfig.switcher` is `false`.
 */
export function ThemeSwitcher({className = ''}: IThemeSwitcherProps) {
    const {optionId, palette, paletteToggle, switcher, selectTheme, selectPalette} = useTheme();
    const lightLabel = useText('Light');
    const darkLabel = useText('Dark');

    const modes = useMemo<IPaletteMode[]>(
        () => [
            {value: 'light', label: lightLabel, icon: 'pi pi-sun'},
            {value: 'dark', label: darkLabel, icon: 'pi pi-moon'},
        ],
        [lightLabel, darkLabel],
    );

    if (!switcher) return null;

    return (
        <div className={['blong-theme-switcher', className].filter(Boolean).join(' ')}>
            <Dropdown
                value={optionId}
                options={THEME_GROUPS}
                optionLabel="label"
                optionValue="id"
                optionGroupLabel="label"
                optionGroupChildren="items"
                onChange={e => selectTheme(e.value as string)}
                className="blong-theme-switcher__select"
                panelClassName="blong-theme-switcher__panel"
                aria-label="Theme"
            />
            {paletteToggle ? (
                <SelectButton
                    value={palette}
                    options={modes}
                    optionLabel="label"
                    optionValue="value"
                    allowEmpty={false}
                    onChange={e => {
                        if (e.value) selectPalette(e.value as PaletteType);
                    }}
                    itemTemplate={(mode: IPaletteMode) => (
                        <span className="blong-theme-switcher__mode-item">
                            <i className={mode.icon} />
                            <span>{mode.label}</span>
                        </span>
                    )}
                    className="blong-theme-switcher__mode"
                    aria-label="Color mode"
                />
            ) : null}
        </div>
    );
}
