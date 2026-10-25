/**
 * `formatValue` — one place that turns a stored value into the text a reader sees.
 *
 * ### The specification
 *
 * A date column in a table, a date input in a form and a report cell show the same
 * field, so they format it the same way, through `Intl`:
 *
 * - **Dates are `medium`** — `Apr 2, 2026` in English, `2.04.2026 г.` in Bulgarian.
 *   A numeric style cannot be read across languages: `04/02/2026` is April 2nd in one
 *   locale and 4 February in another, so the locale's own month name is the only
 *   spelling that needs no key beside it.
 * - **Times are `medium`**, which leaves 12- or 24-hour to the locale — `7:15:32 AM`
 *   in English, `7:15:32` in Bulgarian — and keeps the seconds, because an import or
 *   an audit compares two of them.
 * - **Numbers are the locale's**, grouped by what the value means: a measure groups
 *   (`1,275.5`), a count, rank or year does not (`2032`).
 *
 * ### Where the settings come from
 *
 * Every part of it is configuration, and the layers resolve most specific first
 * (`@@D-616`):
 *
 * 1. **A column's own `widget.formatOptions`** — raw `Intl` options for its type.
 * 2. **The user's preference** — `setFormat('user', …)`, loaded with the profile.
 * 3. **The system-wide configuration** — `setFormat('system', …)`, set by the app.
 * 4. **The per-language default** — {@link languageDefaults}.
 *
 * The **locale is a setting, not an accident**: it defaults to the UI language, so a
 * cell agrees with the Calendar beside it (whose locale the language switch already
 * drives), and a user may point it at another language for the dates alone. It is
 * never taken from the machine, which would render the same record differently on two
 * developers' screens.
 */

/** The style presets a preference can choose — one word a settings UI can offer. */
export type DateStylePreset = 'full' | 'long' | 'medium' | 'short';
export type TimeStylePreset = 'full' | 'long' | 'medium' | 'short';

/** How a measured number is grouped. */
export type GroupingPreset = 'auto' | 'always' | 'never';

/** One layer of formatting configuration. Every key is optional. */
export interface IFormatConfig {
    /** BCP-47 language tag. Defaults to the UI language. */
    locale?: string;
    dateStyle?: DateStylePreset;
    timeStyle?: TimeStylePreset;
    /** 12- or 24-hour clock; unset leaves the locale's own choice. */
    hourCycle?: 'h12' | 'h23';
    /** ISO 4217 code a currency cell falls back to. */
    currency?: string;
    /** `auto` (a measure groups, a count does not), or forced either way. */
    grouping?: GroupingPreset;
}

/** Per-type overrides, as declared on `widget.formatOptions`. */
export interface IFormatOptions {
    date?: Intl.DateTimeFormatOptions;
    time?: Intl.DateTimeFormatOptions;
    dateTime?: Intl.DateTimeFormatOptions;
    number?: Intl.NumberFormatOptions;
    currency?: Intl.NumberFormatOptions & {currency?: string};
    percent?: Intl.NumberFormatOptions;
}

export type FormatType =
    | 'date'
    | 'time'
    | 'dateTime'
    | 'number'
    | 'integer'
    | 'currency'
    | 'percent';

/** What a component needs from the formatter once the settings are resolved. */
export type FormatFn = (
    value: unknown,
    type: FormatType,
    options?: IFormatOptions,
    useGrouping?: boolean,
) => string;

/** What the product shows when nobody configured anything. */
const BASE_DEFAULTS: IFormatConfig = {
    dateStyle: 'medium',
    timeStyle: 'medium',
    grouping: 'auto',
    currency: 'EUR',
};

/**
 * Language defaults beyond the base ones. A currency has no locale-wide answer, so
 * this is the language's own currency until the system configuration says otherwise.
 */
const LANGUAGE_DEFAULTS: Record<string, IFormatConfig> = {
    bg: {currency: 'BGN'},
};

/** The fourth layer: what this language shows with no configuration at all. */
export function languageDefaults(language?: string): IFormatConfig {
    const base = (language ?? '').split('-')[0];
    return {...BASE_DEFAULTS, locale: language, ...(LANGUAGE_DEFAULTS[base] ?? {})};
}

/**
 * Resolve the layers into the configuration one value is formatted with.
 *
 * `user` beats `system` beats the language default, key by key — so a user who only
 * chose a 24-hour clock still gets the system's date style, and an app that never
 * configured anything gets the specification above.
 */
export function resolveFormatConfig(layers: {
    user?: IFormatConfig;
    system?: IFormatConfig;
    language?: string;
}): IFormatConfig {
    const defaults = languageDefaults(layers.language);
    const pick = <K extends keyof IFormatConfig>(key: K): IFormatConfig[K] =>
        layers.user?.[key] ?? layers.system?.[key] ?? defaults[key];
    return {
        locale: pick('locale'),
        dateStyle: pick('dateStyle'),
        timeStyle: pick('timeStyle'),
        hourCycle: pick('hourCycle'),
        currency: pick('currency'),
        grouping: pick('grouping'),
    };
}

function toDate(value: unknown): Date | undefined {
    if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value;
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDate(
    value: unknown,
    format: Intl.DateTimeFormatOptions,
    locale: string | undefined,
): string {
    const date = toDate(value);
    if (!date) return String(value);
    return new Intl.DateTimeFormat(locale, format).format(date);
}

/**
 * The display text of `value`, or the value itself when it cannot be read as its
 * declared type — a bad value is shown, never hidden.
 */
export function formatValue(
    value: unknown,
    type: FormatType,
    options?: IFormatOptions,
    useGrouping?: boolean,
    config: IFormatConfig = {},
): string {
    if (value === null || value === undefined || value === '') return '';
    const locale = config.locale;
    const clock = config.hourCycle ? {hourCycle: config.hourCycle} : {};
    switch (type) {
        case 'date':
            return formatDate(
                value,
                options?.date ?? {dateStyle: config.dateStyle ?? 'medium'},
                locale,
            );
        case 'time':
            return formatDate(
                value,
                options?.time ?? {timeStyle: config.timeStyle ?? 'medium', ...clock},
                locale,
            );
        case 'dateTime':
            return formatDate(
                value,
                options?.dateTime ?? {
                    dateStyle: config.dateStyle ?? 'medium',
                    timeStyle: config.timeStyle ?? 'medium',
                    ...clock,
                },
                locale,
            );
        case 'number':
        case 'integer': {
            const numeric = typeof value === 'number' ? value : Number(value);
            if (isNaN(numeric)) return String(value);
            const grouping = config.grouping ?? 'auto';
            return new Intl.NumberFormat(locale, {
                // `auto`: a measure groups, a year, a rank and a count do not.
                useGrouping:
                    useGrouping ??
                    (grouping === 'auto' ? type === 'number' : grouping === 'always'),
                maximumFractionDigits: type === 'integer' ? 0 : undefined,
                ...options?.number,
            }).format(numeric);
        }
        case 'currency': {
            const numeric = typeof value === 'number' ? value : Number(value);
            if (isNaN(numeric)) return String(value);
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: options?.currency?.currency ?? config.currency ?? 'EUR',
                ...options?.currency,
            }).format(numeric);
        }
        case 'percent': {
            const numeric = typeof value === 'number' ? value : Number(value);
            if (isNaN(numeric)) return String(value);
            return new Intl.NumberFormat(locale, {
                style: 'percent',
                maximumFractionDigits: 2,
                ...options?.percent,
            }).format(numeric);
        }
    }
}
