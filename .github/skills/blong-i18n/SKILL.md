---
name: blong-i18n
description: Implement multi-language support (i18n) in blong-browser; translate UI labels, validation messages, and PrimeReact widget strings. Use this skill whenever working on translations, localization, language switching, the Text component, Button label translation, appStore setTranslations/setLanguage, PrimeReact locale registration, or adding a lang story arg — even if the user just says "add Bulgarian support", "translate this label", or "make this work in another language".
---

# blong-i18n Skill

blong-browser has a lightweight string-translation system built on `appStore`. All translations are
keyed by their English string — so the same key is used as both the translation lookup and the
English fallback.

---

## Text component — the translation primitive

`<Text>` is the universal translation primitive for any visible string in the UI. Wrap every
user-visible label, button text, card title, or message in `<Text>` so it participates in
translation automatically. Its string children are used as both the translation key and the English
fallback:

```tsx
import {Text} from '@feasibleone/blong-browser';

<Text>Save</Text>
// → renders translated 'Save', or falls back to 'Save'

<Text params={{field: 'Name', minLength: 3}}>
    {'{field} must be at least {minLength} characters'}
</Text>
// → translates the template, then interpolates {field} and {minLength}
```

Non-string children pass through unchanged. The optional `params` prop is applied **after**
translation for template interpolation.

---

## Button auto-translation

The blong `Button` component auto-translates string `label` values via `Text`. Always import
`Button` from blong-browser — the raw PrimeReact Button bypasses this:

```tsx
import {Button} from '@feasibleone/blong-browser'; // ✅ label is translated
// import {Button} from 'primereact/button';        // ✗ no translation

<Button label="Save" icon="pi pi-save" />
// → aria-label set to translations['Save'] ?? 'Save', so getByRole('button', {name: '...'})
//   finds the translated label in tests
```

Note: the Editor toolbar's built-in Save/Reset/Edit/Next buttons are **raw `<button>` elements**
with a hardcoded `aria-label` — they are **not** translated. Only buttons that go through the blong
`Button` component or `<Text>` wrapper participate in translation.

---

## Activating a language

Call these two methods on `appStore` to switch locale:

```ts
import {useAppStore} from '@feasibleone/blong-browser';

// 1. Load the translation dictionary (English key → translated string)
useAppStore.getState().setTranslations({
    Save: 'Запази',
    Edit: 'Редактирай',
    Reset: 'Отмени',
    Name: 'Име',
    Description: 'Описание',
    '{field} is required': '{field} е задължително',
    '{field} must be at least {minLength} characters':
        '{field} трябва да бъде поне {minLength} символа',
});

// 2. Activate the language (also triggers PrimeReact locale)
useAppStore.getState().setLanguage('bg');
```

Reset to English:

```ts
useAppStore.getState().setTranslations({});
useAppStore.getState().setLanguage('en');
```

---

## Validation message translation

Validation messages in `src/schema/validate.ts` use `{field}` placeholder templates. The `{field}`
token is resolved to the field's **translated** label at render time:

```ts
// English template as key → translated template as value
const translations = {
    '{field} is required': '{field} е задължително',
    '{field} must be at least {minLength} characters':
        '{field} трябва да бъде поне {minLength} символа',
    '{field} must be at most {maxLength} characters':
        '{field} трябва да съдържа най-много {maxLength} символа',
    '{field} must be at least {minimum}': '{field} трябва да бъде поне {minimum}',
    '{field} must be at most {maximum}': '{field} трябва да бъде най-много {maximum}',
    '{field} has invalid format': '{field} има невалиден формат',
};
```

---

## PrimeReact widget locale (Theme.languages)

PrimeReact widgets (Calendar, Dropdown empty message, etc.) have their own locale system, separate
from the `Text`/`appStore` system. Register locale data via `IThemeConfig.languages` on `<App>` —
the `Theme` component calls `addLocale` automatically:

```tsx
<App
    dispatch={dispatch}
    theme={{
        name: 'lara-light-blue',
        palette: 'light',
        languages: {
            bg: {
                accept: 'Да',
                cancel: 'Отказ',
                emptyMessage: 'Не са открити резултати',
                dateFormat: 'dd/mm/yy',
                firstDayOfWeek: 1,
                // … full locale from https://github.com/primefaces/primelocale
            },
        },
    }}
/>
```

`Theme` calls `locale(language)` reactively whenever `appStore.language` changes, so
`setLanguage('bg')` activates the registered PrimeReact locale automatically.

---

## Storybook: adding a language story

Use the `lang` story arg — `withDispatch` in `.storybook/dispatch.tsx` reads it from
`context.args.lang` and handles everything automatically:

```ts
export const ToolbarBG: StoryFn = Template.bind({});
ToolbarBG.args = {
    ...Toolbar.args,
    lang: 'bg',
};
```

`withDispatch` will:
1. Look up `primeLocales['bg']` and pass it as `theme.languages` to `<App>`
2. Apply `bgTranslations` (or a `translations` override) via `appStore.setTranslations`
3. Call `appStore.setLanguage('bg')` to activate the PrimeReact locale

### Adding a new language to Storybook

1. Fetch PrimeReact locale JSON from `https://github.com/primefaces/primelocale/<lang>.json`
2. Add `const <lang>PrimeLocale = { ... }` in `.storybook/dispatch.tsx`
3. Register it: `primeLocales['<lang>'] = <lang>PrimeLocale`
4. Add a translations constant: `export const <lang>Translations = parseTranslations('Key=Value\n...')`
5. Wire it up in the `withDispatch` switch (or the existing `effectiveLang === 'bg'` pattern)

The `parseTranslations` helper in `dispatch.tsx` converts a `'Key=Value\n...'` string to a
`Record<string, string>` dict — convenient for maintaining large translation tables as readable text.

---

## Unit tests: applying translations

In Vitest unit tests, `withDispatch` is not active. Apply translations directly via `appStore`
before rendering, and clean up after:

```ts
import {useAppStore} from '../../state/appStore.js';
import {bgTranslations} from '../../../.storybook/dispatch.js';

it('ValidationBG render equals snapshot', async () => {
    useAppStore.getState().setTranslations(bgTranslations);
    useAppStore.getState().setLanguage('bg');
    try {
        const {container} = render(ValidationBG(ValidationBG.args ?? {}), {dispatch});
        // ... test body
    } finally {
        useAppStore.getState().setTranslations({});
        useAppStore.getState().setLanguage('en');
    }
});
```

Always reset in a `finally` block so a failed test doesn't pollute subsequent tests with stale
translations.

### Writing play functions for translated stories

When a story relies on `lang: 'bg'`, the play function queries must use translated accessible names
for `Text`-wrapped content, but **English** for raw toolbar buttons (which are not translated):

```ts
// Field labels are translated (via Text component in the form)
await userEvent.clear(canvas.getByRole('textbox', {name: 'Иmе'}));

// Toolbar Save button is a raw <button aria-label="Save"> — NOT translated
await userEvent.click(canvas.getByRole('button', {name: 'Save'}));
```

---

## appStore translation slice

| Field          | Type                    | Purpose                              |
| -------------- | ----------------------- | ------------------------------------ |
| `translations` | `Record<string, string>`| Active key→value translation dict   |
| `language`     | `string`                | Active locale code (`'en'`, `'bg'`) |

| Method             | Signature                             | Effect                          |
| ------------------ | ------------------------------------- | ------------------------------- |
| `setTranslations`  | `(dict: TranslationDict) => void`     | Replace the entire dictionary   |
| `setLanguage`      | `(language: string) => void`          | Set locale; triggers PrimeReact |
