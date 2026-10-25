import {describe, expect, it} from 'vitest';

import {formatValue, languageDefaults, resolveFormatConfig} from './format.js';

/** The fourth layer: what a language shows when nobody configured anything. */
describe('languageDefaults', () => {
    it('states the whole specification for a language with no extra defaults', () => {
        expect(languageDefaults('en')).toEqual({
            locale: 'en',
            dateStyle: 'medium',
            timeStyle: 'medium',
            grouping: 'auto',
            currency: 'EUR',
        });
    });

    it('adds what the language itself decides, and reads a regional tag as its language', () => {
        expect(languageDefaults('bg').currency).toBe('BGN');
        expect(languageDefaults('bg-BG').currency).toBe('BGN');
        expect(languageDefaults('en-GB').currency).toBe('EUR');
    });
});

/**
 * The chain the settings UI relies on: the most specific layer wins, and it wins key
 * by key, so a user who only chose a clock keeps everything else. `@@D-616`
 */
describe('resolveFormatConfig', () => {
    it('is the language default when neither the user nor the system configured anything', () => {
        expect(resolveFormatConfig({language: 'bg'})).toEqual(languageDefaults('bg'));
    });

    it('lets the system configuration override the language default', () => {
        const config = resolveFormatConfig({
            system: {currency: 'USD', grouping: 'never'},
            language: 'bg',
        });
        expect(config.currency).toBe('USD');
        expect(config.grouping).toBe('never');
        expect(config.dateStyle).toBe('medium');
        expect(config.locale).toBe('bg');
    });

    it('lets the user preference win over the system configuration', () => {
        const config = resolveFormatConfig({
            user: {currency: 'GBP'},
            system: {currency: 'USD', dateStyle: 'short'},
            language: 'en',
        });
        expect(config.currency).toBe('GBP');
        expect(config.dateStyle).toBe('short');
    });

    it('resolves key by key, so a user who chose only a clock keeps the system date style', () => {
        const config = resolveFormatConfig({
            user: {hourCycle: 'h23'},
            system: {dateStyle: 'full'},
            language: 'bg',
        });
        expect(config.hourCycle).toBe('h23');
        expect(config.dateStyle).toBe('full');
        expect(config.timeStyle).toBe('medium');
        expect(config.currency).toBe('BGN');
    });
});

describe('formatValue with a resolved configuration', () => {
    const date = '2024-05-14';

    it('formats a date in the configured locale', () => {
        expect(
            formatValue(date, 'date', undefined, undefined, resolveFormatConfig({language: 'bg'})),
        ).toContain('.05.2024');
        expect(
            formatValue(date, 'date', undefined, undefined, resolveFormatConfig({language: 'en'})),
        ).toContain('May');
    });

    it('keeps the locale a user chose apart from the UI language', () => {
        const config = resolveFormatConfig({user: {locale: 'en-GB'}, language: 'bg'});
        expect(formatValue(date, 'date', undefined, undefined, config)).toContain('May');
    });

    it('takes the date style from the configuration, and the column still wins over it', () => {
        const config = resolveFormatConfig({system: {dateStyle: 'full'}, language: 'en'});
        expect(formatValue(date, 'date', undefined, undefined, config)).toContain('Tuesday');
        expect(
            formatValue(date, 'date', {date: {dateStyle: 'short'}}, undefined, config),
        ).toMatch(/5\/14\/24|14\/05\/2024/);
    });

    it('honours a chosen clock', () => {
        const at = '2024-05-14T00:00:00';
        expect(
            formatValue(at, 'time', undefined, undefined, {locale: 'en', hourCycle: 'h23'}),
        ).not.toContain('AM');
        expect(
            formatValue(at, 'time', undefined, undefined, {locale: 'en', hourCycle: 'h12'}),
        ).toContain('AM');
    });

    it('groups a measure but not a count, unless the configuration says otherwise', () => {
        const en = {locale: 'en'};
        expect(formatValue(1234567, 'number', undefined, undefined, en)).toBe('1,234,567');
        expect(formatValue(1234567, 'integer', undefined, undefined, en)).toBe('1234567');
        expect(
            formatValue(1234567, 'integer', undefined, undefined, {...en, grouping: 'always'}),
        ).toBe('1,234,567');
        expect(
            formatValue(1234567, 'number', undefined, undefined, {...en, grouping: 'never'}),
        ).toBe('1234567');
    });

    it('takes the currency code from the language default until a layer overrides it', () => {
        const bg = resolveFormatConfig({language: 'bg'});
        expect(formatValue(12.5, 'currency', undefined, undefined, bg)).toMatch(/BGN|лв/);
        const system = resolveFormatConfig({system: {currency: 'EUR'}, language: 'bg'});
        expect(formatValue(12.5, 'currency', undefined, undefined, system)).toMatch(/EUR|€/);
    });
});

describe('formatValue', () => {
    it('formats a date through Intl, not the raw string', () => {
        const text = formatValue('2024-05-14T00:00:00.000Z', 'date');
        expect(text).not.toContain('2024-05-14');
        expect(text).toMatch(/2024/);
    });

    it('groups a number but leaves an integer ungrouped', () => {
        expect(formatValue(2032, 'number')).toBe(new Intl.NumberFormat().format(2032));
        expect(formatValue(2032, 'integer')).toBe('2032');
        expect(formatValue(2032, 'integer', undefined, true)).toBe(
            new Intl.NumberFormat(undefined, {useGrouping: true}).format(2032),
        );
    });

    it('shows a currency with the code the column asked for', () => {
        const text = formatValue(12.5, 'currency', {currency: {currency: 'BGN'}});
        expect(text).toMatch(/BGN|лв/);
    });

    it('returns an unreadable value rather than a placeholder', () => {
        expect(formatValue('not a date', 'date')).toBe('not a date');
        expect(formatValue(null, 'date')).toBe('');
        expect(formatValue(undefined, 'number')).toBe('');
    });
});
