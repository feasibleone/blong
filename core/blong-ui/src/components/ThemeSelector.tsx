/**
 * ThemeSelector — dropdown for switching between registered PrimeReact themes.
 */

import React from 'react';

import {useTheme} from '../hooks/useTheme.js';
import {getThemeEntry} from '../themes/registry.js';

/** Props for the ThemeSelector component. */
export interface ThemeSelectorProps {
    /** CSS class for the container. */
    className?: string;
    /** Whether to show a label before the selector. */
    showLabel?: boolean;
}

/**
 * ThemeSelector — lets users switch between available PrimeReact theme presets.
 *
 * @example
 * ```tsx
 * <ThemeSelector />
 * ```
 */
export function ThemeSelector({
    className = '',
    showLabel = true,
}: ThemeSelectorProps): React.ReactElement {
    const {themeName, setThemeName, availableThemes} = useTheme();

    return React.createElement(
        'div',
        {className: `blong-theme-selector ${className}`.trim()},
        showLabel &&
            React.createElement(
                'label',
                {htmlFor: 'blong-theme-select', className: 'blong-theme-selector-label'},
                'Theme',
            ),
        React.createElement(
            'select',
            {
                id: 'blong-theme-select',
                className: 'blong-theme-selector-select',
                value: themeName,
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                    setThemeName(e.target.value),
            },
            ...availableThemes.map(name => {
                const entry = getThemeEntry(name);
                return React.createElement(
                    'option',
                    {key: name, value: name},
                    entry?.label ?? name,
                );
            }),
        ),
    );
}
