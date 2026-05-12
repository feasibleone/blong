# Layer

Layers are named groups of handlers that organise code by functional concern within a realm.
For the conceptual overview and the list of well-known layer names, see
[concepts/layer](../concepts/layer.md).

## Folder Structure

Well-known layer folders are auto-discovered — no `layer.server.ts` is needed:

```
realmname/
├── server.ts            # Optional — only for realm-level shared config
├── error/               # Auto-activated (server, always)
│   └── error.ts
├── adapter/             # Auto-activated (server, always)
│   ├── db.ts            # Self-contained adapter with config + validation
│   └── db/              # Handler group: realmname.db
│       ├── userUserAdd.ts
│       └── userUserFind.ts
├── orchestrator/        # Auto-activated (server, always)
│   ├── dispatch.ts      # Self-contained orchestrator with config + validation
│   └── user/            # Handler group: realmname.user
│       ├── ~.schema.ts  # Auto-generated validation schema
│       └── userUserAdd.ts
├── gateway/             # Auto-activated (server, always)
│   └── api/
│       └── user.yaml
├── sim/                 # Auto-activated (server, integration only)
│   └── backend.ts
└── test/                # Auto-activated (server: test; browser: integration)
    └── test/            # Handler group: test.test
        └── testUser.ts
```

Custom layer folders (non-well-known names) require a `layer.server.ts` or `layer.browser.ts`:

```ts
// myCustomLayer/layer.server.ts
import {layer} from '@feasibleone/blong';

export default layer({
    default: true,       // active in all environments
    microservice: true,  // additionally active in microservice deployment
});
```

## Self-Contained Layer Pattern

Each layer owns its configuration and validation. Avoid putting layer config in the parent
`server.ts` — this makes the layer reusable and reduces the number of files to change when
adding a new adapter or orchestrator.

### Adapter

```ts
// adapter/db.ts
import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.knex',

    validation: blong.type.Object({
        namespace: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        imports: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        logLevel: blong.type.Optional(blong.type.String()),
    }),

    activation: {
        default: {
            namespace: 'db/$subject',
            imports: '$subject.db',
        },
        dev: {logLevel: 'trace'},
        prod: {logLevel: 'warn'},
    },
}));
```

### Orchestrator

```ts
// orchestrator/dispatch.ts
import {orchestrator} from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',

    validation: blong.type.Object({
        namespace: blong.type.Union([blong.type.String(), blong.type.Array(blong.type.String())]),
        imports: blong.type.Union([
            blong.type.String(),
            blong.type.Array(blong.type.String()),
            blong.type.Array(blong.type.RegExp()),
        ]),
        destination: blong.type.Optional(blong.type.String()),
    }),

    activation: {
        default: {
            destination: 'db',
            namespace: ['$subject'],
            imports: [/^$subject\./],
        },
    },
}));
```

### Realm Entry Point (only when needed)

`server.ts` is optional. Include it only when config or validation must be shared across layers:

```ts
// server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({
        myService: blong.type.Object({url: blong.type.String()}),
    }),
    activation: {
        default: {
            myService: {url: 'http://localhost:8080'},
        },
    },
}));
```

## Handler Group Naming

Groups are named `realmname.foldername`. For example, a realm named `user` with a folder
`orchestrator/user/` produces the group name `user.user`.

Reference groups in the `imports` property:

```ts
activation: {
    default: {
        namespace: ['user', 'role'],
        imports: ['user.user', 'user.role'],
    },
},
```

### Group-Level Default Config

Each handler group folder can contain a `config.ts` that sets defaults for all handlers in that
group:

```ts
// orchestrator/payment/config.ts
export default {
    default: {
        timeout: 30000,
        endpoint: 'https://api.payment.example.com',
    },
    dev: {
        endpoint: 'https://api.dev.payment.example.com',
    },
};
```

## Error Layer

```ts
// realmname/error/error.ts
export default {
    userNotFound: 'User not found',
    userExists: 'User already exists',
    permissionDenied: 'Permission denied',
};
```

## One Handler Per File

Each handler lives in its own file named after the semantic triple:

- `userUserAdd` → `userUserAdd.ts`
- `paymentTransferSend` → `paymentTransferSend.ts`

This makes `ctrl+p` / quick-open discovery fast: typing `uua` immediately finds
`userUserAdd.ts`.

## Best Practices

1. **Co-locate config** — put validation and activation inside the layer file, not `server.ts`.
2. **One file per handler** — keeps diffs small and discovery fast.
3. **Group by entity** — place handlers for the same business entity in the same folder.
4. **Use `~.schema.ts`** for auto-generated validation (see [validation](./validation.md)).
5. **Error first** — define errors in the `error` layer before implementing any business logic.

## Examples

- Complete realm: `core/test/demo/`
- EIP patterns with mocks: `core/blong-eip/`
