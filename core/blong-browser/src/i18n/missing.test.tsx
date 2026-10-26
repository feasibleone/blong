import {fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {I18nMissingPage} from '../pages/i18nMissingPage.js';
import {useAppStore} from '../state/appStore.js';
import type {IPortalConfig} from '../types/portal.js';
import {collectStart, collectStop, recordRendered} from './collect.js';
import {TRANSLATION_REPORT_METHOD, withTranslationReport} from './menu.js';

beforeEach(() => {
    collectStop();
    useAppStore.setState({
        language: 'bg',
        translations: {},
        translationsByLanguage: {},
        translationBundle: {},
    });
});

describe('the untranslated-strings page', () => {
    it('lists the rendered keys the dictionary cannot answer', () => {
        collectStart();
        recordRendered('Save');
        recordRendered('Save');
        recordRendered('Unmapped label');
        useAppStore.getState().setTranslationsByLanguage({bg: {Save: 'Запази'}});

        render(<I18nMissingPage />);

        expect(screen.getByText('Unmapped label')).toBeTruthy();
        expect(screen.queryByText('Save')).toBeNull();
        // The count column is what makes a twice-rendered string visible.
        expect(screen.getByText('1')).toBeTruthy();
    });

    it('copies the missing keys as seed lines', async () => {
        collectStart();
        recordRendered('Save');
        recordRendered('Edit');
        const writeText = vi.fn(async () => undefined);
        Object.assign(navigator, {clipboard: {writeText}});

        render(<I18nMissingPage />);
        fireEvent.click(screen.getByRole('button', {name: 'Copy seed lines'}));

        expect(writeText).toHaveBeenCalledWith('Edit=\nSave=');
        expect(await screen.findByText('Copied')).toBeTruthy();
    });

    it('says so when nothing is missing', () => {
        collectStart();
        render(<I18nMissingPage />);
        expect(
            screen.getByText(
                'Nothing is missing. Open the screens you want to check, then refresh.',
            ),
        ).toBeTruthy();
    });
});

describe('the menu entry', () => {
    const base = {name: 'portal', title: 'Portal'} as IPortalConfig;

    it('is added only to a portal that collects', () => {
        expect(withTranslationReport(base)).toBe(base);
        const collecting: IPortalConfig = {...base, translation: {collect: true}};
        const withEntry = withTranslationReport(collecting);
        const menu = withEntry.menu as Array<{title: string; items: unknown[]}>;
        expect(menu[menu.length - 1].title).toBe('Translations');
        expect(menu[menu.length - 1].items).toEqual([{method: TRANSLATION_REPORT_METHOD}]);
    });

    it('is not added twice', () => {
        const collecting: IPortalConfig = {...base, translation: {collect: true}};
        const once = withTranslationReport(collecting);
        expect(withTranslationReport(once)).toBe(once);
    });
});
