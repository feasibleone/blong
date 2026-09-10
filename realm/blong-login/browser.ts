/// <reference types="vite/client" />
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    // `./browser` carries the browser-side subject namespace declaration
    // (`browser/orchestrator/subject/init.ts`) so the portal/backend adapter
    // can dispatch `login.*` calls; `./test` is the browser test layer.
    //
    // On the browser platform (Vite bundle, `window` defined) folder strings
    // are skipped — only path-keyed loaders are discovered — so the browser
    // layer is declared with the canonical `import.meta.glob`.  The glob keys
    // (e.g. `./browser/orchestrator/subject/init.ts`) nest under the well-known
    // `browser/orchestrator` layer, so the child resolves to the same name and
    // activation config as the explicit path-keyed form.  The tap/ts-node
    // runner uses the folder strings (non-window branch).
    children: globalThis.window
        ? import.meta.glob(['./browser/**/*.ts'])
        : ['./browser', './test'],
    config: {
        default: {
            browser: {},
        },
        dev: {},
        microservice: {},
        integration: {
            test: true,
        },
    },
}));
