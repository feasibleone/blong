import {describe, expect, it} from 'vitest';
import {render, screen} from '../../test/render.js';

import {PALETTE_FONT_SIZES, PRIMEREACT_PALETTE_THEMES, Theme} from './Theme.js';

describe('Theme', () => {
    it('renders children', () => {
        render(
            <Theme theme={{name: 'lara-light-blue'}}>
                <div data-testid="child">Hello</div>
            </Theme>,
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('applies light palette class by default', () => {
        const {container} = render(
            <Theme theme={{name: 'test', palette: 'light'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app--light')).toBeInTheDocument();
    });

    it('applies dark palette class when specified', () => {
        const {container} = render(
            <Theme theme={{name: 'dark-theme', palette: 'dark'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app--dark')).toBeInTheDocument();
    });

    it('applies compact palette class', () => {
        const {container} = render(
            <Theme theme={{name: 'compact-theme', palette: 'compact'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app--compact')).toBeInTheDocument();
    });

    it('applies light-compact palette class', () => {
        const {container} = render(
            <Theme theme={{name: 'lc', palette: 'light-compact'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app--light-compact')).toBeInTheDocument();
    });

    it('applies dark-compact palette class', () => {
        const {container} = render(
            <Theme theme={{name: 'dc', palette: 'dark-compact'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app--dark-compact')).toBeInTheDocument();
    });

    it('applies big palette class', () => {
        const {container} = render(
            <Theme theme={{name: 'big', palette: 'big'}}>
                <span />
            </Theme>,
        );
        expect(container.querySelector('.blong-app--big')).toBeInTheDocument();
    });

    it('applies rtl class and dir when direction is rtl', () => {
        const {container} = render(
            <Theme theme={{name: 'rtl', direction: 'rtl'}}>
                <span />
            </Theme>,
        );
        const app = container.querySelector('.blong-app');
        expect(app?.getAttribute('dir')).toBe('rtl');
        expect(app?.classList.contains('blong-app--rtl')).toBe(true);
    });

    it('applies ltr dir by default', () => {
        const {container} = render(
            <Theme theme={{name: 'default'}}>
                <span />
            </Theme>,
        );
        const app = container.querySelector('.blong-app');
        expect(app?.getAttribute('dir')).toBe('ltr');
    });

    describe('PRIMEREACT_PALETTE_THEMES', () => {
        it('maps lara family for light, dark, big palettes', () => {
            expect(PRIMEREACT_PALETTE_THEMES.light.light).toBe('lara-light-blue');
            expect(PRIMEREACT_PALETTE_THEMES.light.dark).toBe('lara-dark-blue');
            expect(PRIMEREACT_PALETTE_THEMES.dark.light).toBe('lara-light-blue');
            expect(PRIMEREACT_PALETTE_THEMES.big.light).toBe('lara-light-blue');
        });

        it('maps saga/vela family for compact palettes', () => {
            expect(PRIMEREACT_PALETTE_THEMES.compact.light).toBe('saga-blue');
            expect(PRIMEREACT_PALETTE_THEMES.compact.dark).toBe('vela-blue');
            expect(PRIMEREACT_PALETTE_THEMES['light-compact'].light).toBe('saga-blue');
            expect(PRIMEREACT_PALETTE_THEMES['dark-compact'].light).toBe('vela-blue');
        });
    });

    describe('PALETTE_FONT_SIZES', () => {
        it('returns 16px for light, dark, big palettes', () => {
            expect(PALETTE_FONT_SIZES.light).toBe(16);
            expect(PALETTE_FONT_SIZES.dark).toBe(16);
            expect(PALETTE_FONT_SIZES.big).toBe(16);
        });

        it('returns 14px for compact palettes', () => {
            expect(PALETTE_FONT_SIZES.compact).toBe(14);
            expect(PALETTE_FONT_SIZES['light-compact']).toBe(14);
            expect(PALETTE_FONT_SIZES['dark-compact']).toBe(14);
        });
    });
});
