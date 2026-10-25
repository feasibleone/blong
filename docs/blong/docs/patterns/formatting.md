# Formatting values

One function turns a stored value into the text a reader sees: a date column, a date input and a
report cell all format the same field the same way. The formatter is `formatValue` in
`core/blong-browser/src/lib/format.ts`, and a component reaches it through the `useFormatValue`
hook, which resolves the configuration first.

## The specification

With nobody configuring anything, a value reads like this:

| Type       | What it shows                                          | English example  |
| ---------- | ------------------------------------------------------ | ---------------- |
| `date`     | the locale's `medium` date — a month name, not numbers | `Apr 2, 2026`    |
| `time`     | `medium`, seconds kept                                 | `7:15:32 AM`     |
| `dateTime` | both of the above                                      | `Apr 2, 2026, …` |
| `number`   | a measure: grouped, up to three decimals               | `1,275.456`      |
| `integer`  | a count, rank or year: not grouped                     | `2032`           |
| `currency` | the configured currency, grouped                       | `€450.50`        |
| `percent`  | up to two decimals                                     | `92.5%`          |

A date is never numeric by default: `04/02/2026` is April 2nd in one locale and 4 February in
another, so the locale's own month name is the only spelling that needs no key beside it.

The **locale** is a setting, not an accident. It defaults to the UI language, so a table cell agrees
with the Calendar beside it, and it is never taken from the machine — a record must not render
differently on two developers' screens.

## Where the settings come from

Four layers, most specific first. They resolve **key by key**, so a user who only chose a clock
still gets the system's date style, and a column that only sets decimals keeps everything else from
below it.

| #   | Layer        | Set by                                                                           |
| --- | ------------ | -------------------------------------------------------------------------------- |
| 1   | the column   | `widget.formatOptions` on the field — raw `Intl` options for its type            |
| 2   | the user     | `setFormat('user', …)` — the person's own preference, loaded with the profile    |
| 3   | the system   | `setFormat('system', …)` — the app's configuration                               |
| 4   | the language | `languageDefaults(language)` — the fallbacks above, plus the language's currency |

The language layer is the only one that carries a value nobody asked for: `bg` falls back to `BGN`,
`en` to `EUR`. A currency has no locale-wide answer, so a language may state its own.

```ts
import {resolveFormatConfig, formatValue} from './lib/format.js';

const config = resolveFormatConfig({
    user: {hourCycle: 'h23'},
    system: {dateStyle: 'short', currency: 'BGN'},
    language: 'bg',
});
// {locale: 'bg', dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23',
//  currency: 'BGN', grouping: 'auto'}

formatValue('2026-04-02T07:15:32', 'dateTime', undefined, undefined, config);
```

## The configuration

`IFormatConfig` is one layer; every key is optional.

| Key         | Type                                    | Meaning                                                    |
| ----------- | --------------------------------------- | ---------------------------------------------------------- |
| `locale`    | BCP-47 tag                              | the language dates and numbers are written in              |
| `dateStyle` | `full` \| `long` \| `medium` \| `short` | the preset a `date` cell uses                              |
| `timeStyle` | `full` \| `long` \| `medium` \| `short` | the preset a `time` cell uses                              |
| `hourCycle` | `h12` \| `h23`                          | 12- or 24-hour clock; unset leaves the locale's own choice |
| `currency`  | ISO 4217 code                           | the code a `currency` cell falls back to                   |
| `grouping`  | `auto` \| `always` \| `never`           | `auto` groups a measure and not a count                    |

These are the words a settings UI offers — a preset per row, not a builder for `Intl` options.

## In a component

```tsx
import {useFormatValue} from '../hooks/useFormat.js';

function Total({amount}: {amount: number}) {
    const format = useFormatValue();
    return <span>{format(amount, 'currency')}</span>;
}
```

The hook subscribes to the language and to both configuration layers, so a language switch or a
settings change re-renders the text instead of leaving yesterday's month names on screen.

## Setting a layer

The layers live in the app store, so an app sets them where it already owns its settings:

```ts
import {useAppStore} from './state/appStore.js';

// on load, from the app's configuration
useAppStore.getState().setFormat('system', {dateStyle: 'short', currency: 'BGN'});

// from a settings screen, or from the profile
useAppStore.getState().setFormat('user', {hourCycle: 'h23'});

// back to the layer below
useAppStore.getState().setFormat('user', undefined);
```

## Per-column options

A column may override any of it. `widget.formatOptions` takes the `Intl` options of its own type, so
it can say anything the presets cannot:

```ts
area: {
    title: 'Area (m²)',
    widget: {type: 'number', formatOptions: {number: {maximumFractionDigits: 1}}},
},
fee: {
    title: 'Fee',
    widget: {type: 'currency', formatOptions: {currency: {currency: 'USD'}}},
},
```

| Field                    | Applies to          | Overrides                  |
| ------------------------ | ------------------- | -------------------------- |
| `formatOptions.date`     | `date`              | `dateStyle`                |
| `formatOptions.time`     | `time`              | `timeStyle`, `hourCycle`   |
| `formatOptions.dateTime` | `dateTime`          | both of the above          |
| `formatOptions.number`   | `number`, `integer` | decimals and grouping      |
| `formatOptions.currency` | `currency`          | the code and its options   |
| `formatOptions.percent`  | `percent`           | the percent options        |
| `widget.useGrouping`     | `number`, `integer` | `grouping` for this column |

`useGrouping` is the shortcut for the common case, and it defaults differently on purpose: a
`number` groups unless it says `false`, an `integer` does not unless it says `true`.

## Tests

`src/lib/format.test.ts` covers the chain — the language defaults, the per-key precedence, and the
four types against a resolved configuration. A test that cares about the text asserts on a locale it
names, never on the machine's:

```ts
expect(formatValue(date, 'date', undefined, undefined, {locale: 'bg'})).toContain('.05.2024');
```

## See it working

The `Editor/TableColumns` stories show each layer on the same row — `FormattingSystem`,
`FormattingUser` and `FormattingBG` — beside `Formatting`, which is the specification alone:

```bash
cd core/blong-browser
node --run storybook
npx test-storybook --includeTags table-columns
```

See [Foreign key labels](./foreign-key-labels.md) for the label a key column shows instead of the
key itself.
