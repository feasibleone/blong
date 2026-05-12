# Layer

Layers are named groups of handlers. The names of layers can be arbitrary
(though must be valid identifiers), but it is recommended to use single
lowercase words.

## Recommended Layer Names

### Server-Side Layers

The following server-side layer folder names are **auto-discovered** by the framework — no
`layer.server.ts` file is required:

* `error` - domain-specific error definitions, always active on the server.

* [adapter](./adapter.md) - the part of the functionality that implements
  functions related directly to communicating with external systems, often
  handling network protocols. This often relates directly with the
  `Data integrity logic`. Examples include handling communication with SQL, HTTP,
  FTP, mail and other servers or devices.

* [orchestrator](./orchestrator.md) - the part of the functionality that
  coordinates the work between adapters. This is often the place where the
  `business process` is implemented.

* [gateway](./gateway.md) - the part of the functionality related to the API gateway.
  It includes functions related to API documentation, validations,
  route handlers, etc. Usually it includes almost no `business logic`.

* `sim` - simulated external backends used during integration testing only.

* `test` - this layer holds the test automation functionality, which is
  usually only activated during the development and build stages.

### Browser-Side Layers

The following browser-side layer folder names are **auto-discovered** — no `layer.browser.ts` is
required:

* `backend` - this layer resides in the browser app and holds the adapter
  that talks to the server.

* `component` - this layer resides in the browser app and is used
  to implement specific React components for the UI.

* `browser` - this layer holds the server-side code, used to serve
  the assets needed for the browser.

## Auto-Discovery and Activation Defaults

Well-known folder names are automatically detected and activated in the correct environment.
Custom folder names require a `layer.server.ts` or `layer.browser.ts` file.

| Folder         | Server active in          | Browser active in    |
| -------------- | ------------------------- | -------------------- |
| `error`        | always                    | —                    |
| `adapter`      | always                    | —                    |
| `orchestrator` | always                    | —                    |
| `gateway`      | always                    | —                    |
| `sim`          | `integration` only        | —                    |
| `test`         | `test` only               | `integration` only   |
| `backend`      | —                         | always               |
| `component`    | —                         | always               |
| `browser`      | always (serves assets)    | —                    |

## Co-Located Configuration

Layers are **self-contained** — each layer file defines its own configuration and validation,
co-located with its implementation. There is no need to maintain activation config in the parent
`server.ts`. A realm's `server.ts` is only needed when configuration is shared across multiple
layers.

```ts
// adapter/db.ts — config and validation are part of the layer definition
import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.knex',
    validation: blong.type.Object({
        namespace: blong.type.String(),
        imports: blong.type.String(),
    }),
    activation: {
        default: {
            namespace: 'db/$subject',
            imports: '$subject.db',
        },
    },
}));
```

## Custom Layers

For folder names that are not in the well-known list above, add a `layer.server.ts` or
`layer.browser.ts` to declare when the layer should be active:

```ts
// myCustomLayer/layer.server.ts
import {layer} from '@feasibleone/blong';

export default layer({
    default: true,       // active in all environments
    microservice: true,  // also active in microservice deployment
});
```

For the full implementation patterns, including handler group naming, folder structure, and
activation options, see the [Layer patterns](../patterns/layer.md) page.
