import { describe, expect, it } from 'vitest';
import { render, screen } from '../../test/render.js';

import { PALETTE_FONT_SIZES, PRIMEREACT_PALETTE_THEMES, Theme } from './Theme.js';

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
