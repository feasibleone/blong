/**
 * Theme — PrimeReact theming provider with CSS variable support.
 */
import {PrimeReactProvider} from 'primereact/api';
import {type ReactNode, useEffect} from 'react';

export interface IThemeConfig {
    name: string;
    palette?: 'light' | 'dark';
    direction?: 'ltr' | 'rtl';
    primary?: string;
}

interface IThemeProps {
    theme: IThemeConfig;
    children: ReactNode;
}

export function Theme({theme, children}: IThemeProps) {
    useEffect(() => {
        // Apply direction
        document.documentElement.dir = theme.direction ?? 'ltr';
        document.documentElement.lang = theme.direction === 'rtl' ? 'ar' : 'en';

        // Apply custom primary color via CSS variable
        if (theme.primary) {
            document.documentElement.style.setProperty('--p-primary-color', theme.primary);
        }
    }, [theme]);

    return (
        <PrimeReactProvider value={{ripple: true, inputStyle: 'outlined'}}>
            <div
                className={[
                    'blong-app',
                    `blong-app--${theme.palette ?? 'light'}`,
                    theme.direction === 'rtl' ? 'blong-app--rtl' : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
                dir={theme.direction ?? 'ltr'}
            >
                {children}
            </div>
        </PrimeReactProvider>
    );
}
