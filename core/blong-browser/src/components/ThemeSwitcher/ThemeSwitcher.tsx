import './ThemeSwitcher.css';

import {useText} from '../../hooks/useText.js';
import {Button, Dropdown} from '../../primereact/index.js';
import {useTheme, type PaletteType} from '../Theme/Theme.js';
import {THEME_GROUPS} from '../Theme/themeRegistry.js';

export interface IThemeSwitcherProps {
    /** Extra class name for the wrapper. */
    className?: string;
}

/**
 * ThemeSwitcher — the theme selector shown in the portal menubar, to the left
 * of the language switcher.
 *
 * A dropdown picks the theme family (Light/Dark variants of a family share one
 * entry; Glass/Wood are standalone). When the selected theme provides both a
 * light and a dark variant, a single borderless sun/moon icon button appears
 * next to the dropdown to flip between them. The icon shows the mode the button
 * switches **to**: a moon while light mode is active, a sun while dark mode is
 * active.
 *
 * The choice is written to `appStore.setTheme` (persisted to localStorage) and
 * applied by the `<Theme>` provider. Render it inside `<Theme>` so `useTheme()`
 * has the effective theme.
 *
 * Renders nothing when `IThemeConfig.switcher` is `false`.
 */
export function ThemeSwitcher({className = ''}: IThemeSwitcherProps) {
    const {optionId, palette, paletteToggle, switcher, selectTheme, selectPalette} = useTheme();
    const toLightLabel = useText('Switch to light mode');
    const toDarkLabel = useText('Switch to dark mode');

    if (!switcher) return null;

    const isDark = palette === 'dark';
    const nextPalette: PaletteType = isDark ? 'light' : 'dark';
    const modeLabel = isDark ? toLightLabel : toDarkLabel;
    const modeIcon = isDark ? 'pi pi-sun' : 'pi pi-moon';

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
                <Button
                    type="button"
                    icon={modeIcon}
                    text
                    rounded
                    severity="secondary"
                    tooltip={modeLabel}
                    tooltipOptions={{position: 'bottom'}}
                    aria-label={modeLabel}
                    onClick={() => selectPalette(nextPalette)}
                    className="blong-theme-switcher__mode"
                />
            ) : null}
        </div>
    );
}
