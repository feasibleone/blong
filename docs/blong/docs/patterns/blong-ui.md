# Modular UI

How to wire blong-ui into a suite and write UI pages for a realm.

See [Browser UI](../concepts/browser-ui.md) for the concept overview.

---

## Adding blong-ui to a Suite

Include the blong-ui realm in the suite's `browser.ts` entry point
alongside the application realms:

```typescript
// browser.ts
import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    children: [
        async function blongUi() {
            return import('@feasibleone/blong-ui/browser.js');
        },
        './marine',  // application realm
    ],
    config: {
        default: {adapter: true, orchestrator: true},
    },
}));
```

The blong-ui realm automatically registers the portal shell, auth
handling, backend adapter, and storage adapter. No explicit initialisation
is needed.

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
see [Schema based UI](blong-ui-model.md).

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
import {Editor} from '@feasibleone/blong-ui';
import type {IEnrichedSchema} from '@feasibleone/blong-ui';

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
import {Explorer} from '@feasibleone/blong-ui';

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

Inside a React component rendered by blong-ui, use the context hooks:

```ts
import {useBlongUi} from '@feasibleone/blong-ui';

const {dispatch, schemaRegistry} = useBlongUi();

// Call any registered handler
const result = await dispatch('marine.coral.find', {coralName: 'Brain'});

// Get enriched schema for an object
const schema = await schemaRegistry.resolve('marine.coral');
```

---

## Storybook Pattern

Stories mock the dispatch function to develop and test components in isolation.
Use the `withDispatch` decorator from `.storybook/dispatch.js`:

```tsx
// CoralOpen.stories.tsx
import {withDispatch} from '../../../.storybook/dispatch.js';
import {coralSchema, mockCoral} from '../fixtures/coral.js';

export default {
    title: 'marine/CoralOpen',
    decorators: [withDispatch({
        'marine.coral.get': () => ({coral: [mockCoral]}),
        'marine.coral.edit': ({coral}) => ({coral}),
    })],
};

export const Default = {
    render: () => <CoralOpen schema={coralSchema} coralId={1} />,
};
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
