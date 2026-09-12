/* spell-checker: disable */
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../state/appStore.js';
import { render, screen } from '../../test/render.js';

import {
    PALETTE_FONT_SIZES,
    PRIMEREACT_PALETTE_THEMES,
    Theme,
    useTheme,
} from './Theme.js';

/** Renders the effective `useTheme()` values so tests can assert resolution. */
function ThemeProbe() {
    const { optionId, palette, paletteToggle, switcher } = useTheme();
    return <span data-testid="probe">{`${optionId}|${palette}|${paletteToggle}|${switcher}`}</span>;
}

beforeEach(() => {
    localStorage.removeItem('blong.theme');
    useAppStore.setState(s => ({ ...s, theme: {} }));
});

describe('Theme', () => {
    it('renders children', () => {
        render(
            <Theme theme={{type: 'compact', palette: 'dark'}}>
                <div data-testid="child">Hello</div>
            </Theme>,
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('applies dark palette class by default', () => {
        const {container} = render(
            <Theme theme={{type: 'compact'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app-dark')).toBeInTheDocument();
    });

    it('applies dark palette class when specified', () => {
        const {container} = render(
            <Theme theme={{palette: 'dark'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app-dark')).toBeInTheDocument();
    });

    it('applies light palette class', () => {
        const {container} = render(
            <Theme theme={{palette: 'light'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app-light')).toBeInTheDocument();
    });

    it('applies compact type class', () => {
        const {container} = render(
            <Theme theme={{type: 'compact'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app-compact')).toBeInTheDocument();
    });

    it('applies big type class', () => {
        const {container} = render(
            <Theme theme={{type: 'big'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app-big')).toBeInTheDocument();
    });

    it('does not apply the glass class by default', () => {
        const {container} = render(
            <Theme theme={{}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app-glass')).not.toBeInTheDocument();
    });

    it('applies the glass class when variant is glass', () => {
        const {container} = render(
            <Theme theme={{variant: 'glass'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app.blong-app-glass')).toBeInTheDocument();
    });

    it('still applies palette/type classes alongside glass', () => {
        const {container} = render(
            <Theme theme={{variant: 'glass', palette: 'dark', type: 'compact'}}>
                <span />
            </Theme>,
        );
        const app = container.querySelector('.blong-app');
        expect(app?.classList.contains('blong-app-glass')).toBe(true);
        expect(app?.classList.contains('blong-app-dark')).toBe(true);
        expect(app?.classList.contains('blong-app-compact')).toBe(true);
    });

    it('does not apply the wood class by default', () => {
        const {container} = render(
            <Theme theme={{}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app-wood')).not.toBeInTheDocument();
    });

    it('applies the wood class when variant is wood', () => {
        const {container} = render(
            <Theme theme={{variant: 'wood'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app.blong-app-wood')).toBeInTheDocument();
    });

    it('still applies palette/type classes alongside wood', () => {
        const {container} = render(
            <Theme theme={{variant: 'wood', palette: 'dark', type: 'compact'}}>
                <span />
            </Theme>,
        );
        const app = container.querySelector('.blong-app');
        expect(app?.classList.contains('blong-app-wood')).toBe(true);
        expect(app?.classList.contains('blong-app-dark')).toBe(true);
        expect(app?.classList.contains('blong-app-compact')).toBe(true);
    });

    it('applies rtl class and dir when direction is rtl', () => {
        const {container} = render(
            <Theme theme={{direction: 'rtl'}}>
                <span />
            </Theme>,
        );
        const app = container.querySelector('.blong-app');
        expect(app?.getAttribute('dir')).toBe('rtl');
        expect(app?.classList.contains('blong-app-rtl')).toBe(true);
    });

    it('applies ltr dir by default', () => {
        const {container} = render(
            <Theme theme={{}}>
                <span />
            </Theme>,
        );
        const app = container.querySelector('.blong-app');
        expect(app?.getAttribute('dir')).toBe('ltr');
    });

    describe('PRIMEREACT_PALETTE_THEMES', () => {
        it('maps lara family for light, dark, big palettes', () => {
            expect(PRIMEREACT_PALETTE_THEMES.big.light).toBe('lara-light-blue');
        });

        it('maps saga/vela family for compact palettes', () => {
            expect(PRIMEREACT_PALETTE_THEMES.compact.light).toBe('saga-blue');
            expect(PRIMEREACT_PALETTE_THEMES.compact.dark).toBe('vela-blue');
        });
    });

    describe('PALETTE_FONT_SIZES', () => {
        it('returns 16px for big palettes', () => {
            expect(PALETTE_FONT_SIZES.big).toBe(16);
        });

        it('returns 14px for compact palettes', () => {
            expect(PALETTE_FONT_SIZES.compact).toBe(14);
        });
    });
});

describe('Theme resolution (useTheme)', () => {
    it('resolves the legacy type/palette mapping by default', () => {
        render(
            <Theme theme={{type: 'compact', palette: 'dark'}}>
                <ThemeProbe />
            </Theme>,
        );
        expect(screen.getByTestId('probe').textContent).toBe('vela-blue|dark|false|true');
    });

    it('resolves a light/dark family and exposes the palette toggle', () => {
        render(
            <Theme theme={{name: 'lara-blue'}}>
                <ThemeProbe />
            </Theme>,
        );
        expect(screen.getByTestId('probe').textContent).toBe('lara-blue|dark|true|true');
    });

    it('applies the explicit selection from the store', () => {
        useAppStore.setState(s => ({...s, theme: {themeId: 'soho', palette: 'light'}}));
        render(
            <Theme theme={{type: 'compact', palette: 'dark'}}>
                <ThemeProbe />
            </Theme>,
        );
        expect(screen.getByTestId('probe').textContent).toBe('soho|light|true|true');
        expect(
            document.querySelector('.blong-app')?.classList.contains('blong-app-light'),
        ).toBe(true);
    });

    it('keeps blong variants on the dark base with no palette toggle', () => {
        render(
            <Theme theme={{name: 'glass'}}>
                <ThemeProbe />
            </Theme>,
        );
        expect(screen.getByTestId('probe').textContent).toBe('glass|dark|false|true');
        expect(document.querySelector('.blong-app-glass')).toBeInTheDocument();
    });

    it('exposes switcher:false through the context', () => {
        render(
            <Theme theme={{switcher: false}}>
                <ThemeProbe />
            </Theme>,
        );
        expect(screen.getByTestId('probe').textContent).toBe('vela-blue|dark|false|false');
    });
});
