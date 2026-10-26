import {act, renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useOptionLabel, useText} from '../hooks/useText.js';
import {useAppStore} from '../state/appStore.js';
import {bundledTranslations} from './bundled.js';
import {collectStart, collectStop, recordRendered, translationReport} from './collect.js';

/** Reset every layer the tests touch, so one case cannot leak into the next. */
function reset() {
    act(() => {
        useAppStore.setState({
            language: 'en',
            translations: {},
            translationsByLanguage: {},
            translationBundle: {},
            translationLoader: undefined,
        });
    });
}

describe('translation composition', () => {
    beforeEach(reset);

    it('composes bundled, then the suite configuration, then the database', () => {
        useAppStore.getState().setTranslationsByLanguage({bg: {Login: 'Влизане'}});
        useAppStore.getState().setTranslationBundle('bg', {label: {Login: 'Вход в системата'}});
        act(() => useAppStore.getState().setLanguage('bg'));

        const {translations} = useAppStore.getState();
        expect(translations.Login).toBe('Вход в системата');
        // A bundled key the other layers say nothing about stays translated.
        expect(translations['Back to Login']).toBe(bundledTranslations.bg['Back to Login']);
    });

    it('answers English from the key itself, with no bundled table', () => {
        expect(bundledTranslations.en).toEqual({});
        expect(useAppStore.getState().translations).toEqual({});
    });

    it('loads a language once even when two switches race', async () => {
        const loader = vi.fn(async () => ({label: {Save: 'Запази'}}));
        useAppStore.getState().setTranslationLoader(loader);

        await Promise.all([
            useAppStore.getState().languageActivate('bg'),
            useAppStore.getState().languageActivate('bg'),
        ]);

        expect(loader).toHaveBeenCalledTimes(1);
        expect(useAppStore.getState().translations.Save).toBe('Запази');
    });

    it('keeps the bundled dictionary when the database cannot be read', async () => {
        useAppStore
            .getState()
            .setTranslationLoader(async () => Promise.reject(new Error('no such table')));

        await act(() => useAppStore.getState().languageActivate('bg'));

        const {translations} = useAppStore.getState();
        expect(translations['Login with password']).toBe('Вход с парола');
        expect(translations.Save).toBeUndefined();
    });
});

describe('rendered-string collector', () => {
    beforeEach(() => {
        reset();
        collectStop();
    });

    it('reports rendered keys and separates the unanswered ones', () => {
        collectStart();
        recordRendered('Save');
        recordRendered('Save');
        recordRendered('Untranslated');
        useAppStore.getState().setTranslationsByLanguage({bg: {Save: 'Запази'}});
        act(() => useAppStore.getState().setLanguage('bg'));

        const report = translationReport();
        expect(report.language).toBe('bg');
        expect(report.rendered).toEqual(['Save', 'Untranslated']);
        expect(report.missing).toEqual(['Untranslated']);
    });

    it('treats an empty translation as missing', () => {
        collectStart();
        recordRendered('Browse');
        useAppStore.getState().setTranslationsByLanguage({bg: {Browse: ''}});
        act(() => useAppStore.getState().setLanguage('bg'));
        expect(translationReport().missing).toEqual(['Browse']);
    });

    it('records nothing while collection is off', () => {
        collectStart();
        collectStop();
        recordRendered('Ignore me');
        expect(translationReport().rendered).toEqual([]);
    });
});

describe('option labels', () => {
    beforeEach(reset);

    it('translates a static option label and leaves a fetched one alone', () => {
        useAppStore.getState().setTranslationBundle('bg', {label: {Female: 'Жена'}});
        act(() => useAppStore.getState().setLanguage('bg'));

        const {result} = renderHook(() => useOptionLabel());
        // A model-declared label is a dictionary key.
        expect(result.current({value: 'female', label: 'Female'})).toBe('Жена');
        // A record's name is data: the read translated it, the browser does not.
        expect(result.current({value: 'b64-sport', label: 'Athletics'})).toBe('Athletics');
    });

    it('translates what a Text child renders through the same dictionary', () => {
        useAppStore.getState().setTranslationsByLanguage({bg: {Save: 'Запази'}});
        act(() => useAppStore.getState().setLanguage('bg'));
        const {result} = renderHook(() => useText('Save'));
        expect(result.current).toBe('Запази');
    });
});
