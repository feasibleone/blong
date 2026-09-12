/* spell-checker: disable */
import {describe, expect, it} from 'vitest';
import {
    THEME_GROUPS,
    THEME_LOADERS,
    THEME_OPTIONS,
    paletteOfFolder,
    resolveThemeFolder,
    themeOptionByFolder,
    themeOptionById,
    themeOptionByName,
    type IPrimeThemeOption,
} from './themeRegistry.js';

function option(id: string): IPrimeThemeOption {
    const found = themeOptionById(id);
    if (!found) throw new Error(`missing theme option: ${id}`);
    return found;
}

describe('themeRegistry', () => {
    it('exposes each option exactly once across the groups', () => {
        const ids = THEME_OPTIONS.map(o => o.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(THEME_GROUPS.flatMap(g => g.items)).toHaveLength(THEME_OPTIONS.length);
    });

    it('provides a loader for every referenced PrimeReact folder', () => {
        const folders = THEME_OPTIONS.flatMap(o => [o.light, o.dark]).filter(
            (f): f is string => Boolean(f),
        );
        expect(folders.length).toBeGreaterThan(0);
        for (const folder of folders) {
            expect(THEME_LOADERS[folder], `loader for ${folder}`).toBeTypeOf('function');
        }
    });

    it('resolves options by id and by folder', () => {
        expect(option('lara-blue').dark).toBe('lara-dark-blue');
        expect(themeOptionByFolder('lara-dark-blue')?.id).toBe('lara-blue');
        expect(themeOptionByFolder('vela-blue')?.id).toBe('vela-blue');
        expect(themeOptionByFolder('does-not-exist')).toBeUndefined();
    });

    it('infers the palette of a PrimeReact folder', () => {
        expect(paletteOfFolder('lara-light-blue')).toBe('light');
        expect(paletteOfFolder('lara-dark-blue')).toBe('dark');
        expect(paletteOfFolder('saga-blue')).toBe('light');
        expect(paletteOfFolder('vela-blue')).toBe('dark');
    });

    it('resolves the folder for an option + palette', () => {
        expect(resolveThemeFolder(option('lara-blue'), 'light')).toBe('lara-light-blue');
        expect(resolveThemeFolder(option('lara-blue'), 'dark')).toBe('lara-dark-blue');
        // Single-variant themes fall back to the variant they ship.
        expect(resolveThemeFolder(option('saga-blue'), 'dark')).toBe('saga-blue');
    });

    it('resolves a config name (option id or folder) to an option + palette', () => {
        expect(themeOptionByName('soho')?.palette).toBe('dark');
        expect(themeOptionByName('soho-light')?.palette).toBe('light');
        expect(themeOptionByName('glass')?.option.variant).toBe('glass');
        expect(themeOptionByName('unknown-theme')).toBeUndefined();
    });

    it('pairs the light and dark variants of a family', () => {
        expect(option('soho').light).toBe('soho-light');
        expect(option('soho').dark).toBe('soho-dark');
        expect(option('bootstrap4-blue').light).toBe('bootstrap4-light-blue');
        expect(option('bootstrap4-blue').dark).toBe('bootstrap4-dark-blue');
    });
});
