# Test runs console

A realm contributes a **Test runs** page with four small pieces: a page handler, a catalog, the page
component and, when server-hosted entries are wanted, a `testRealm` child and its group allowlist.
The scaffold in `core/blong-kopi` already ships them; this page explains how they fit together.

See the [concept](../concepts/test-run.md) for what the console is and the
[rationale](../rationale/test-run.md) for the design choices.

---

## 1. Turn on the `test-ui` intent

The page handler is always discovered, but the menu item is declared only in the `test-ui` config
block of the browser entry, and the browser entry passes the intent:

```typescript
// index.html.ts
load(browser, pkg.name, {apiSchema: false}, ['microservice', 'integration', 'dev', 'test-ui'])
    .then(platform => platform.start({}))
    .catch(console.error);
```

```typescript
// index.browser.ts
config: {
    'test-ui': {
        ui: {
            portal: {
                portal: {
                    menu: [
                        {
                            title: 'Test',
                            items: [
                                {
                                    title: 'Test runs',
                                    method: 'shop.test.run',
                                    icon: 'pi pi-play',
                                },
                            ],
                        },
                    ],
                },
            },
        },
        blong: {},
        login: {},
        shop: {},
    } as never,
},
```

A normal portal does not link the page. `test-ui` also activates the `test` and `browser/test`
layers without the `integration` runner, so the page can load a group in a development build.

---

## 2. The page handler

The handler lazy-loads the React page from `src/pages/`, so the Node tap runner can load it without
resolving `.tsx`:

```typescript
// browser/orchestrator/component/shopTestRun.ts
import {handler} from '@feasibleone/blong';

export default handler(function shopTestRun() {
    return {
        'shop.test.run': async () => ({
            title: 'Test runs',
            icon: 'pi pi-play',
            component: async () => {
                const {ShopTestRunPage} = await import('../../../src/pages/shopTestRunPage.js');
                return ShopTestRunPage;
            },
        }),
    };
});
```

The method name is a page action, not a test group. The catalog is what names the groups.

---

## 3. The catalog is the guard

```typescript
// src/pages/shopTestRunCatalog.ts
import type {ITestRunCatalogEntry} from '@feasibleone/blong-browser';

export const shopTestRunCatalog: ITestRunCatalogEntry[] = [
    {method: 'test.widget.flow', name: 'widget flow browser'},
    {method: 'test.widget', name: 'widget flow server', host: 'server'},
];
```

| Field         | Meaning                                               |
| ------------- | ----------------------------------------------------- |
| `method`      | Wire name of the test group, e.g. `test.widget.flow`. |
| `name`        | Display name in the picker.                           |
| `host`        | `browser` (default) or `server`.                      |
| `groups`      | Optional group names the scenario covers.             |
| `description` | Optional sentence shown with the entry.               |

`TestRunPage` never calls its loader with a method the catalog does not list.

---

## 4. The page and its browser loader

```tsx
// src/pages/shopTestRunPage.tsx
import {
    TestRunPage,
    useBlong,
    type ITestRunEventPage,
    type ITestRunModel,
    type ITestRunServerTransport,
} from '@feasibleone/blong-browser';
import type {IMeta} from '@feasibleone/blong/types';
import {shopTestRunCatalog} from './shopTestRunCatalog.js';

const testGroups: Record<string, () => Promise<{default: unknown}>> = {
    'test.widget.flow': () => import('../../browser/test/test/testWidget.flow.js'),
};

export function ShopTestRunPage() {
    const {handler} = useBlong();

    const load = async (method: string) => {
        const module = await testGroups[method]?.();
        if (!module) throw new Error(`no browser test group for ${method}`);
        const definition = module.default as (
            api: unknown,
        ) => Record<string, (params?: object) => unknown>;
        const group = (name: string) => (steps: unknown[]) =>
            Object.defineProperty(steps, 'name', {value: name, enumerable: false});
        const methods = definition({lib: {group}, handler});
        const handlerName = method
            .split('.')
            .filter(Boolean)
            .map((part, index) => (index === 0 ? part : part[0].toUpperCase() + part.slice(1)))
            .join('');
        const invoke = methods[handlerName];
        if (typeof invoke !== 'function') throw new Error(`no test group method for ${method}`);
        const steps = invoke({hasSession: true});
        if (!Array.isArray(steps)) throw new Error(`"${method}" did not return a step array`);
        return steps as never;
    };

    return (
        <TestRunPage
            title="Test runs"
            catalog={shopTestRunCatalog}
            load={load}
            capture
        />
    );
}
```

The group definition receives the page's handler proxy, so a step's login and API calls reach the
gateway exactly as they do in a tap run. The `group` shim gives the returned step array the name the
reviewer sees.

### `TestRunPage` props

| Prop                 | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `catalog`            | The only methods the page may run. Required.                               |
| `load`               | Resolve a browser entry to its step array.                                 |
| `transport`          | Server-hosted transport; required when the catalog names a `server` entry. |
| `$meta`              | Meta forwarded to the run; omit for an empty meta.                         |
| `sourceLink`         | Turn captured source pointers into `https` or `vscode` links.              |
| `title`              | Page heading.                                                              |
| `defaultDetailsOpen` | Open the details panel on first render.                                    |
| `capture`            | Write the final model and events into hidden nodes for Playwright.         |

---

## 5. A server-hosted entry

Some groups call handlers that only exist on the server. Their entry names `host: 'server'` and the
page calls the `test.run.*` methods through the `backend` adapter. The UI handler proxy has no
sender for `test.*`, so the call must carry the `backend/` prefix; the backend adapter strips it and
the gateway sees the real route.

```tsx
const backend = handler as unknown as Record<
    string,
    (params: object, meta: IMeta) => Promise<unknown>
>;

const transport: ITestRunServerTransport = {
    start: (method, $meta) =>
        backend['backend/test.run.start']!({method, name: `${method} server`}, $meta) as Promise<{
            runId: string;
            run: ITestRunModel;
        }>,
    events: (runId, cursor) =>
        backend['backend/test.run.eventFind']!({runId, cursor}, {}) as Promise<ITestRunEventPage>,
    snapshot: runId =>
        backend['backend/test.run.snapshotGet']!({runId}, {}) as Promise<ITestRunModel>,
    cancel: async runId => {
        await backend['backend/test.run.cancel']!({runId}, {});
    },
};

return (
    <TestRunPage
        title="Test runs"
        catalog={shopTestRunCatalog}
        load={load}
        transport={transport}
        capture
    />
);
```

`PollingTestRunSource` reads the event page from a cursor every 250 ms, reduces it with the same
reducer the browser source uses, and stops on `run:end` or cancellation. An empty page is expected
while the run is quiet.

### Server-side wiring

Add `testRealm` as a child of the server suite and name the groups it may start:

```typescript
export default server(() => ({
    url: import.meta.url,
    children: [
        async function shop() {
            return import('./server.ts');
        },
        async function testRealm() {
            return import('@feasibleone/blong-test/server.ts');
        },
    ],
    config: {
        dev: {
            testRealm: {testRun: {serverGroups: ['test.widget']}},
        },
        integration: {
            testRealm: {testRun: {serverGroups: ['test.widget']}},
        },
        'test-ui': {
            testRealm: {testRun: {serverGroups: ['test.widget']}},
        },
    },
}));
```

The allowlist is the server's own guard: `test.run.start` refuses a method it does not name, even if
a caller reaches the gateway. The framework realms load before the suite's children, so
`testRealm.testDispatch` is the last port to claim the `test` namespace and the runner receives the
call.

The `test.run.*` routes and their capability are supplied by `realm/blong-test`; its seed grants
`testRunServer` to the `Admin` test role, so no realm-local seed or `skipAuthorize` is needed.

### `test.run.*` methods

| Method                 | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `test.run.start`       | Start a server group and return its initial model. |
| `test.run.eventFind`   | Read events after a cursor.                        |
| `test.run.snapshotGet` | Read the latest full model.                        |
| `test.run.cancel`      | Stop a run.                                        |

---

## 6. Capturing the run in Playwright

`capture` renders the final model as JSON in `[data-testid="test-run-model"]` and the event stream
in `[data-testid="test-run-events"]`. A spec opens the page, starts a catalog entry, waits for
`.blong-test-run__state` to contain `completed`, then asserts on the parsed model and attaches the
screenshot:

```typescript
await expect(testRunPage.locator('.blong-test-run__state')).toContainText('completed', {
    timeout: 120_000,
});
const model = JSON.parse((await testRunPage.getByTestId('test-run-model').textContent()) ?? '{}');
expect(model.counts).toMatchObject({total: 3, completed: 3, failed: 0});
await testInfo.attach('test-run.png', {
    body: await testRunPage.screenshot(),
    contentType: 'image/png',
});
```

Mask the now marker and disable animations when the capture is a committed baseline.

---

## 7. Storybook

The console's own stories are `Components/TestRun`: `Page` (the empty picker), `Replay` (a recorded
run playing at 1x with pause, speed and restart controls), `Live` (an in-page executor run),
`Completed`, `Failure`, `Dense`, `Collapsed`, `Pending`, `Empty`, `Error`, `Narrow` and `Details`.
`Replay` is the story a page embeds when its point is the console's behaviour rather than a still
picture:

```mdx
<StorybookStory
    site="browser"
    id="components-testrun--replay"
    title="Components/TestRun — Replay"
    height="560px"
/>
```

See [embedding a story](./blong-browser.md#embedding-a-story) for the full attribute table.

---

## 8. Scaffolding

`core/blong-kopi` scaffolds the catalog, page and handler, the `test-ui` menu and the `testRealm`
child. When a realm gains another entity, add that entity's group to the catalog and, for a server
group, to `testRealm.testRun.serverGroups`. `blong-kukum`'s `test` primitive registers the group in
`integration.watch.test`; the console's own list is a separate step.
