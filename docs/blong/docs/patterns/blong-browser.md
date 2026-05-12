# Modular UI

How to wire blong-browser into a suite and write UI pages for a realm.

See [Browser UI](../concepts/browser-ui.md) for the concept overview.

---

## Adding blong-browser to a Suite

Include the blong-browser realm in the suite's `browser.ts` entry point
alongside the application realms:

```typescript
// browser.ts
import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default browser(blong => ({
    url: import.meta.url,
    pkg: {name: pkg.name, version: pkg.version},
    children: [
        async function blongUi() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function marine() {
            return import('./marine/browser.ts');
        },
    ],
    config: {
        default: {
            blongUi: {},
            marine: {},
        },
    },
}));
```

The blong-browser realm automatically registers the portal shell, auth
handling, backend adapter, storage adapter, and (in storybook/integration
environments) the mock adapter. No explicit initialisation is needed.

---

## Contributing Pages from a Realm

A realm contributes pages by placing handler files that end with
`.component` in its layer. The portal orchestrator discovers them automatically
by file-name pattern.

### Minimal component handler

```typescript
// marine/component/marineCoralBrowse.component.ts
import {handler} from '@feasibleone/blong';

export default handler(() => ({
    'marine.coral.browse': async () => ({
        title: 'Corals',
        permission: 'marine.coral.browse',
        component: async () => {
            const {CoralBrowse} = await import('./CoralBrowse.js');
            return CoralBrowse;
        },
    }),
}));
```

For the common case of CRUD pages, use the **Model System** instead —
see [Schema based UI](blong-model.md).

### Adding menu items

Place a `.portal` file in the component layer. The portal orchestrator
imports all `*.portal` files to build the navigation menu.

```typescript
// marine/component/marine.portal.ts
import {handler} from '@feasibleone/blong';

export default handler(({handler: {portalMenuItem}}) => ({
    async 'marine.portal.params'() {
        return {
            menu: [{
                title: 'Marine',
                items: [
                    await portalMenuItem('marine.coral.browse'),
                    await portalMenuItem('marine.family.browse'),
                ],
            }],
        };
    },
}));
```

---

## Using Editor Directly

For pages that need custom logic beyond what the model system provides,
use the `Editor` component directly in a React component:

```tsx
import {Editor} from '@feasibleone/blong-browser';
import type {IEnrichedSchema} from '@feasibleone/blong-browser';

export function CoralOpen({schema, coralId}: {schema: IEnrichedSchema; coralId: number}) {
    return (
        <Editor
            schema={schema}
            cards={{
                main: {
                    label: 'Coral Details',
                    widgets: ['coral.coralName', 'coral.familyId', 'coral.maxDepth'],
                    className: 'col-12 md:col-8',
                },
                notes: {
                    label: 'Notes',
                    widgets: ['coral.description'],
                    className: 'col-12 md:col-4',
                },
            }}
            layouts={{edit: ['main', 'notes']}}
            loadAction="marine.coral.get"
            loadParams={{coralId}}
            saveAction="marine.coral.edit"
            editable
        />
    );
}
```

---

## Using Explorer Directly

```tsx
import {Explorer} from '@feasibleone/blong-browser';

export function CoralList({schema}: {schema: IEnrichedSchema}) {
    return (
        <Explorer
            schema={schema}
            listAction="marine.coral.find"
            selectionMode="single"
            toolbar={[{
                label: 'Create',
                icon: 'pi pi-plus',
                action: 'marine.coral.new',
                permission: 'marine.coral.new',
            }]}
        />
    );
}
```

---

## Layout Types

### Flat layout

```ts
layouts={{ edit: ['main', ['contacts', 'notes']] }}
// main = full width; contacts + notes = stacked in second column
```

### Tabbed layout

```ts
layouts={{
    edit: {
        items: [
            {id: 'basic',    label: 'Basic',    icon: 'pi pi-id-card', widgets: ['main']},
            {id: 'contacts', label: 'Contacts', icon: 'pi pi-phone',   widgets: ['contacts']},
        ],
    },
}}
```

### Steps layout

```ts
layouts={{
    edit: {
        type: 'steps',
        items: [
            {id: 'step1', label: 'Identity', widgets: ['identity']},
            {id: 'step2', label: 'Details',  widgets: ['details']},
            {id: 'step3', label: 'Review',   widgets: ['review']},
        ],
    },
}}
```

### Sidebar (ThumbIndex) layout

```ts
layouts={{
    edit: {
        orientation: 'left',
        items: [
            {id: 'groupA', label: 'Group A', icon: 'pi pi-cog', widgets: ['card1', 'card2']},
            {id: 'groupB', label: 'Group B', icon: 'pi pi-user', widgets: ['card3']},
        ],
    },
}}
```

---

## Accessing Dispatch and Schema

Inside a React component rendered by blong-browser, use the context hooks:

```ts
import {useBlongUi} from '@feasibleone/blong-browser';

const {dispatch, schemaRegistry} = useBlongUi();

// Call any registered handler
const result = await dispatch('marine.coral.find', {coralName: 'Brain'});

// Get enriched schema for an object
const schema = await schemaRegistry.resolve('marine.coral');
```

---

## Storybook Pattern

Two Storybook patterns exist:

### Component-level stories (blong-browser internal)

Stories mock the dispatch function to develop and test individual components in isolation.
Use the `withDispatch` decorator from `.storybook/dispatch.js`:

```tsx
// CoralOpen.stories.tsx
import {withDispatch} from '../../../.storybook/dispatch.js';
import {coralEditorFixture, coralStoryValue} from '@feasibleone/blong-marine/meta/storybook.js';

export default {
    title: 'marine/CoralOpen',
    decorators: [withDispatch({
        coralCoralGet: () => Promise.resolve(coralStoryValue),
        coralCoralEdit: params => Promise.resolve(params),
    })],
};

export const Default = {
    render: () => <Editor schema={coralEditorFixture.schema} cards={coralEditorFixture.cards}
                          loadAction="coralCoralGet" saveAction="coralCoralEdit" editable />,
};
```

### Model page stories (ui-demo)

For end-to-end model page stories, use the `Model` component with `withBlong(browser)` in the
`.storybook/preview.tsx`. This loads the full blong platform including the mock adapter:

```tsx
// .storybook/preview.tsx
import withBlong from '@feasibleone/blong-browser/storybook.tsx';
import browser from '../browser.ts';

export default {
    decorators: [withBlong(browser)],
    parameters: {layout: 'fullscreen'},
};
```

Then stories use the `page()` helper:

```tsx
// coral/Coral.stories.tsx
import {page} from '../../storyHelper.js';

export const CoralBrowse     = page('marine.coral.browse');
export const CoralOpen       = page('marine.coral.open', 1);
export const CoralNew        = page('marine.coral.new');
export const CoralOpenSplit  = page('marine.coral.open', 1, {layout: 'editSplit'});
```

---

## Internationalisation (i18n)

blong-browser has a lightweight translation system built on `appStore`.

### Text component

`<Text>` is the universal translation primitive. Its string children act as both the
translation key and the English fallback:

```tsx
import {Text} from '@feasibleone/blong-browser';

<Text>Save</Text>
<Text params={{field: 'Name', minLength: 3}}>
    {'{field} must be at least {minLength} characters'}
</Text>
```

### Button auto-translation

The blong `Button` wrapper auto-translates its string `label` via `<Text>`. Always import
`Button` from blong-browser rather than primereact to get automatic translation:

```tsx
import {Button} from '@feasibleone/blong-browser';  // ✅ translates label
<Button label="Save" icon="pi pi-check" />
```

### Activating a language

```ts
import {useAppStore} from '@feasibleone/blong-browser';

useAppStore.getState().setTranslations({
    Save: 'Запази',
    '{field} is required': '{field} е задължително',
});
useAppStore.getState().setLanguage('bg');
```

### PrimeReact widget locale via `Theme.languages`

Register custom PrimeReact locale data through `IThemeConfig.languages`, which `Theme`
passes to `addLocale` automatically. Fetch locale data from
[primefaces/primelocale](https://github.com/primefaces/primelocale):

```tsx
<App
    dispatch={dispatch}
    theme={{
        name: 'lara-light-blue',
        languages: {
            bg: {
                accept: 'Да', cancel: 'Отказ',
                emptyMessage: 'Не са открити резултати',
                dateFormat: 'dd/mm/yy', firstDayOfWeek: 1,
                // … full locale object
            },
        },
    }}
/>
```

Calling `setLanguage('bg')` activates the PrimeReact locale via `locale('bg')` in `Theme`.

### Storybook language stories

Set `lang: '<locale>'` as a story arg to activate a language for that story — `withDispatch`
picks it up from `context.args.lang`:

```ts
export const ToolbarBG: Story = {...Toolbar};
ToolbarBG.args = {lang: 'bg'};
```

---

## Testing

Add an interaction test with a `play()` function:

```ts
Default.play = async ({canvasElement}) => {
    const canvas = within(canvasElement);
    // Wait for load
    await canvas.findByDisplayValue('Brain Coral');
    // Click Edit
    await userEvent.click(canvas.getByTitle('Edit'));
    // Change a field
    await userEvent.clear(canvas.getByLabelText('Coral Name'));
    await userEvent.type(canvas.getByLabelText('Coral Name'), 'Star Coral');
    // Save
    await userEvent.click(canvas.getByTitle('Save'));
};
```
