# Suite

Suites are the top-level organizational unit in the framework. They are used to
group related realms together. Suites are providing a complete solution for a
particular business process, which is usually a vertical slice of the business.

Suites define top-level entry points for the solution and the framework uses
them to run the solution.

Suites often include combination of reusable realms, but also some realms that
are specific to a particular business. They are often created for a particular
deployment of the solution for a certain business entity. They take
architectural decisions on how the solution is going to be deployed and
specific configuration for that deployment. They are the place where the solution
is glued together by reusing the functionality of the different realms.

## Platform

The suites can define entry points for the different platforms, for example:

- `server` - the entry point for the server side solution, which is usually
  running in a Kubernetes pod.
- `desktop` - the entry point for a desktop application.
- `browser` - the entry point for a browser-based application.

## Testing

To facilitate the testing, realms include a minimal suite,
which helps bootstrapping a minimal solution. This suite includes only the
tested realm and its dependencies. This allows testing the realm in isolation,
without the need to run the whole solution, which is often more complex and
slower to start.

For more information see the [suite](../patterns/suite.md) patterns.

## Browser Platform

Suites can include a browser entry point (`browser.ts`) that provides a
rich, metadata-driven user interface. The browser platform uses the
`@feasibleone/blong-ui` package to automatically generate forms, tables
and detail views from the server's OpenAPI schema.

### Browser Entry Point

```typescript
// browser.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [],
    config: {
        default: {},
        dev: {},
    },
}));
```

### Browser Layers

| Layer         | Purpose |
|---------------|---------|
| `backend`     | Adapter communicating with the server gateway over JSON-RPC |
| `component`   | React component handlers defining UI pages and cards |
| `orchestrator` | Browser-side business logic coordinating backend calls |
| `test`        | Playwright / Storybook interaction tests |
| `init`        | Browser-specific initialisation (theme, locale, service worker) |

### Component Handlers

Component handlers follow the page naming convention:

- `component$subject$entity.browse` — collection view (table)
- `component$subject$entity.new` — create form
- `component$subject$entity.open` — edit form with `{id}` parameter

See [Browser UI](browser-ui.md) for the full metadata-driven component
generation model.
