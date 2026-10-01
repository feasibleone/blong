# Modular UI

How to wire blong-browser into a suite and write UI pages for a realm.

See [Browser UI](../concepts/browser-ui.md) for the concept overview.

---

## Adding blong-browser to a Suite

Include the blong-browser realm in the suite's `browser.ts` entry point alongside the application
realms:

```typescript
// browser.ts
import {browser} from '@feasibleone/blong';
import pkg from './package.json' with {type: 'json'};

export default browser(blong => ({
    url: import.meta.url,
    pkg: {name: pkg.name, version: pkg.version},
    children: [
        async function ui() {
            return import('@feasibleone/blong-browser/browser.ts');
        },
        async function marine() {
            return import('./marine/browser.ts');
        },
    ],
    config: {
        default: {
            ui: {},
            marine: {},
        },
    },
}));
```

The blong-browser realm automatically registers the portal shell, auth handling, backend adapter,
storage adapter, and (in storybook/integration environments) the mock adapter. No explicit
initialisation is needed.

---

## Contributing Pages from a Realm

A realm contributes pages by placing handler files that end with `.component` in its layer. The
portal orchestrator discovers them automatically by file-name pattern.

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

For the common case of CRUD pages, use the **Model System** instead — see
[Schema based UI](blong-model.md).

### Adding menu items

Place a `.portal` file in the component layer. The portal orchestrator imports all `*.portal` files
to build the navigation menu.

```typescript
// marine/component/marine.portal.ts
import {handler} from '@feasibleone/blong';

export default handler(({handler: {portalMenuItem}}) => ({
    async 'marine.portal.params'() {
        return {
            menu: [
                {
                    title: 'Marine',
                    items: [
                        await portalMenuItem('marine.coral.browse'),
                        await portalMenuItem('marine.family.browse'),
                    ],
                },
            ],
        };
    },
}));
```

---

## Using Editor Directly

For pages that need custom logic beyond what the model system provides, use the `Editor` component
directly in a React component:

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

The standalone `Explorer` is a table, a filter panel and a toolbar without an editor around them.
For a _generated_ browse page the composition to follow is `Editor` in its split layout — a
`navigator` widget, a table with a `listAction` and a detail panel — which the `Editor/Explorer`
stories write out and which the model's browse page builds. The widget catalogue, the pivot and
master-detail mechanics are in the [editor features concept](../concepts/editor-features.md); the
declaration that generates the pages is in the [model patterns](./blong-model.md).

```tsx
import {Explorer} from '@feasibleone/blong-browser';

export function CoralList({schema}: {schema: IEnrichedSchema}) {
    return (
        <Explorer
            schema={schema}
            listAction="marine.coral.find"
            selectionMode="single"
            toolbar={[
                {
                    label: 'Create',
                    icon: 'pi pi-plus',
                    action: 'marine.coral.new',
                    permission: 'marine.coral.new',
                },
            ]}
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
import {useBlong} from '@feasibleone/blong-browser';

const {dispatch, schemaRegistry} = useBlong();

// Call any registered handler
const result = await dispatch('marine.coral.find', {coralName: 'Brain'});

// Get enriched schema for an object
const schema = await schemaRegistry.resolve('marine.coral');
```

---

## Storybook Pattern

Every package that renders components ships a Storybook, and it is the **live** half of these docs:
a story is a running component with its fixture data, where a page here can only describe one. Run
the one that belongs to the package you are reading about — `core/blong-browser` for components and
widgets, `demo/blong-marine` or `suite/blong-suite` for whole realms, `tools/blong-log` for the log
viewer:

```bash
cd core/blong-browser && npm run storybook   # port 6006
cd demo/blong-marine  && npm run storybook   # port 6007
```

Storybook is not published as a site yet, so there is nothing here to link to;
`npm run ci-storybook` in any of those packages builds the static output (`storybook-static/`,
gitignored) that a published build would serve.

Two Storybook patterns exist:

### Component-level stories (blong-browser internal)

Stories mock the dispatch function to develop and test individual components in isolation. Use the
`withDispatch` decorator from `.storybook/dispatch.js`:

```tsx
// CoralOpen.stories.tsx
import {withDispatch} from '../../../.storybook/dispatch.js';
import {coralEditorFixture, coralStoryValue} from '@feasibleone/blong-marine/meta/storybook.js';

export default {
    title: 'marine/CoralOpen',
    decorators: [
        withDispatch({
            coralCoralGet: () => Promise.resolve(coralStoryValue),
            coralCoralEdit: params => Promise.resolve(params),
        }),
    ],
};

export const Default = {
    render: () => (
        <Editor
            schema={coralEditorFixture.schema}
            cards={coralEditorFixture.cards}
            loadAction="coralCoralGet"
            saveAction="coralCoralEdit"
            editable
        />
    ),
};
```

### Model page stories (realm package)

For end-to-end model page stories, use the `page()` / `portal()` helpers from
`@feasibleone/blong-browser/storyHelper` and the preview factory `defineBlongStorybookPreview`,
composing the realm's **composed** entry (`index.browser.ts`, which carries the portal port). One
line is the whole preview — the factory owns the toolbar, its persistence and the decorators:

```tsx
// .storybook/preview.tsx
import {defineBlongStorybookPreview} from '@feasibleone/blong-browser/storybook.tsx';
import browser from '../index.browser.ts';

export default defineBlongStorybookPreview(browser, {backend: true});
```

Then stories use the `page()` helper:

```tsx
// coral/Coral.stories.tsx
import {page} from '@feasibleone/blong-browser/storyHelper';

export const CoralBrowse = page('marine.coral.browse');
export const CoralOpen = page('marine.coral.open', 1);
export const CoralNew = page('marine.coral.new');
export const CoralOpenSplit = page('marine.coral.open', 1, {layout: 'editSplit'});
```

`defineBlongStorybookPreview` also accepts `{decorators}` instead of a browser entry — that is what
`blong-browser`'s own preview passes (`withDispatch`), and it is how the presentation items below
reach a component story that has no platform. Omit `backend: true` for those stories: without a
backend adapter there is nothing to point at a gateway.

### The story toolbar

The factory installs five Storybook globals, each remembered in `localStorage` so a reload keeps the
state a reviewer left behind:

| Item        | Values                                | What it drives                                       |
| ----------- | ------------------------------------- | ---------------------------------------------------- |
| `Backend`   | Mock / Live (JSON-RPC) / Live (MLE)   | Where the model pages read their data                |
| `Role`      | the roles of the `storybook:` section | Which role the live gateway is reached with          |
| `Theme`     | every `THEME_OPTIONS` entry           | `useAppStore.setTheme` — the portal's theme switcher |
| `Language`  | `en`, `bg` by default                 | `useAppStore.setLanguage`                            |
| `Direction` | LTR / RTL                             | `IThemeSelection.direction`, so `<Theme>` flips      |

The presentation items are applied through the store rather than a prop, because a platform-loaded
story has no prop to write to: `withBlong` renders the container the platform built, and `<Theme>`
lives inside it. Only a choice the reviewer _changed_ is applied (`changedStorybookGlobals`), so a
story that sets its own `args.lang` or `parameters.theme` keeps it until someone uses the toolbar.

Every item is a plain Storybook global, so a state is scriptable — this is how the docs' own
screenshots and any Playwright run over Storybook reach a state without clicking:

```text
http://localhost:6007/?path=/story/subject-object--browse&globals=backend:jsonrpc;role:Guest
```

#### Mock or live

`Backend: Mock` is the default: the `storybook` intent activates the backend adapter's mock, so
every model handler answers from `meta/fixture/<subject>Fixture.ts` and nothing needs a server.

The two live values load the realm without that mock and switch the adapter to `storybookJsonrpc` /
`storybookMle` respectively, so the platform's model handlers travel to a real gateway. A Storybook
dev-server plugin (`src/storybookBackend.ts`, mounted by `defineBlongStorybookMain`) supplies what a
story otherwise lacks — a session:

- `GET /__blong/storybook?role=R&mode=M` sets the cookies that tell the following `/rpc` calls which
  role and transport they belong to (the plugin cannot sniff that without consuming the request
  body), and answers with the role's credentials when the mode is `mle`.
- `Live (JSON-RPC)` speaks plain JSON-RPC to the plugin, which logs in as the role's seeded user,
  adds the bearer token and decrypts the gateway's MLE-encrypted response. Nothing in the page holds
  a token, and the plugin re-authenticates near expiry on its own.
- `Live (MLE)` keeps the page's own encryption: the story logs in with the role's credentials
  through the platform's own codec, so the key pair the page generated is what signs and encrypts,
  and the session renews itself like an application's would. The story is held back until that login
  completes — rendered first, it would fetch without a session, take a 401 and stay empty.

A token is deliberately not minted by the plugin for the page: the gateway encrypts the response to
every login, so a token whose keys are supposed to travel per request in the JWE header cannot be
read back out of it (measured against a running gateway, not assumed). The reviewer still never sees
a login screen — the login is the decorator's, not theirs.

Which users the roles mean, and which gateway is addressed, come from `.blong_devrc`:

```yaml
storybook:
    target: http://localhost:8080
    roles:
        Admin:
            user: testAdmin
            password: testPassword
        Operator: opsUser
```

Without that section the built-in defaults apply: `http://localhost:8080` and the seeded test users
`Admin`/`testAdmin`, `Manager`/`testManager`, `Guest`/`testGuest` (password `testPassword`). The
endpoint is loopback-only and is mounted by the dev server, never by a build — and it does hand the
`mle` mode's credentials to the page, so point `storybook.target` at a gateway whose credentials you
would be willing to put in a `.blong_devrc`.

A realm that wants a role to see something has to grant it: the template's
`meta/dbTest/accessAuthorizationMerge.yaml` gives `Admin` the full `Manage` capability, `Manager`
read + edit and `Guest`/`Customer` read-only. All three also carry `subject.object.schema` — without
it a read-only role gets a 403 for the page's own schema and renders a blank screen rather than a
smaller one, which is how the Role item earns its place: a Guest who can browse but is refused a
save is a different story from an Admin who can do both.

---

## Internationalisation

Translation, the language switcher, PrimeReact locales and the Storybook `lang` arg have their own
page — see [internationalisation](./i18n.md). In short: a string child is both the key and the
English fallback, a realm declares its `portal.languages` and `portal.translations`, and
PrimeReact's own widget strings arrive through `IThemeConfig.languages`.

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
