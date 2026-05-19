# @feasibleone/blong-browser

A reusable blong **realm** that provides the browser-side infrastructure for building portal-style applications. It contributes two adapters and two orchestrators to any suite that includes it.

## Usage

In your suite's `browser.ts`:

```ts
import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    children: [
        async function blongUi() {
            return import('@feasibleone/blong-browser/browser.js');
        },
        './your-realm',
    ],
}));
```

---

## Architecture

```text
Suite browser.ts
│
└── blong-browser realm (browser.ts)
    │
    ├── adapter/backend.ts       namespace: backend   ← HTTP to server
    ├── adapter/storage.ts       namespace: storage   ← localStorage / memStore
    │
    ├── orchestrator/auth.ts     namespace: auth      ← login / logout / session
    └── orchestrator/portal.ts   namespace: portal    ← UI lifecycle / tab routing
```

Each layer has a single responsibility. Adapters talk exclusively to one external entity. Orchestrators coordinate between adapters and other handlers.

---

## Adapters

### `adapter/backend.ts` — namespace `backend`

Connects to the server-side HTTP API. Extends `adapter.http` and uses `codec.jsonrpc` and `codec.mle` for request encoding and decryption. The backend URL and any additional codec configuration are provided by the suite's realm config.

Every call in the `backend.*` namespace is forwarded to the server as a JSON-RPC request. Suites and realms reach server-side business logic exclusively through this adapter, e.g.:

```text
backend.login.token.create  →  POST /ports/login/request
backend.marine.coral.find   →  POST /ports/marine/request
```

### `adapter/storage.ts` — namespace `storage`

Wraps `localStorage` (browser) with an in-memory `Map` fallback for Node.js / test environments. Its sole concern is reading and writing keyed string values.

Handler group: `ui.storage` (`adapter/storage/`)

| Handler                  | Description                               |
| ------------------------ | ----------------------------------------- |
| `storageTokenGet`        | Read the auth token                       |
| `storageTokenSet`        | Write the auth token                      |
| `storageTokenDelete`     | Remove the auth token                     |
| `storagePermissionsGet`  | Read the permissions array (JSON-decoded) |
| `storagePermissionsSet`  | Write the permissions array (JSON-encoded)|

The shared `storage` library (`adapter/storage/storage.ts`) exposes `storeGet`, `storeSet`, `storeDelete`, `TOKEN_KEY`, and `PERMISSIONS_KEY`, consumed via `{lib: {storeGet, TOKEN_KEY}}` destructuring in each handler.

---

## Orchestrators

### `orchestrator/auth.ts` — namespace `auth`

Orchestrates the user session lifecycle by coordinating calls to the `backend` and `storage` adapters. React state is updated via the Zustand `appStore` after each operation.

Handler group: `ui.auth` (`orchestrator/auth/`)

| Handler          | Calls                                                               | Description                                |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| `authLogin`      | `backend.login.token.create`, `storageTokenSet`, `storagePermissionsSet` | Full login flow: credential validation → token storage → permissions |
| `authLogout`     | `storageTokenDelete`                                                | Clear session token and reset React state  |
| `authSessionGet` | `storageTokenGet`, `storagePermissionsGet`                          | Return current `{token, permissions}`      |

`authLogin` handles the multi-step login protocol transparently, returning a discriminated `step` result (`success`, `otp`, `newPassword`, `credentials`) so the Login component can render the correct UI state without knowing the backend error types.

### `orchestrator/portal.ts` — namespace `portal`

Manages the browser UI lifecycle: bootstrapping the React root, navigating between tabs, and resolving component metadata for menus. Imports component handlers from all realm browser layers via regex patterns (`*.component`, `*.portal`, `*.actions`), making it aware of every screen registered by any realm in the suite.

Handler group: `ui.portal` (`orchestrator/portal/`)

| Handler               | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `portalReady`         | Mount the `<Portal>` React root into `#root`, creating the element if absent    |
| `portalTabShow`       | Open a tab for an action, resolving title from the action's component handler   |
| `portalTabClose`      | Close a tab by ID                                                               |
| `portalMenuItem`      | Resolve `{title, permission, icon}` metadata for a menu action                  |
| `portalDropdownList`  | Delegate a dropdown lookup to the matching action handler                       |
| `portalParamsGet`     | Return current `{activeTabId, tabs}` from the Zustand store                    |

Component handlers from realm browser layers are invoked dynamically by name through the handler proxy (`{handler}`), so the portal orchestrator has no compile-time dependency on any particular realm.

---

## How a realm contributes to the portal

A realm's browser layer exports `componentHandler` functions in its `component/` folder. Each handler returns the metadata the portal needs to render navigation items and lazy-load the component:

```ts
// marine/component/coralBrowse.ts
import {componentHandler} from '@feasibleone/blong';

export default componentHandler(blong =>
    function coralBrowse() {
        return {
            'marine.coral.browse': {
                title: 'Coral',
                permission: 'marine.coral.browse',
                icon: 'coral',
                component: () => import('../pages/CoralBrowse.js'),
            },
        };
    },
);
```

The portal orchestrator's `imports: [/\.component$/]` pattern automatically collects all such handlers from every realm at startup.

---

## React integration

The `src/` tree contains the React side of the library: components, widgets, hooks, and the Zustand `appStore`. These are consumed by the component handlers contributed by each realm and by the portal orchestrator itself. They are independent of the blong bus and can be used in Storybook without a running framework instance.
