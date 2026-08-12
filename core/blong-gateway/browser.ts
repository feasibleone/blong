/// <reference types="vite/client" />
/**
 * blong-gateway/browser.ts — API Gateway realm entry point (browser side).
 *
 * Auto-discovers the schema/models and any browser orchestrator components
 * from `meta/` + `browser/`.  Contributes the Application/Bundle/Subscription
 * management pages to the portal.
 */
import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    children: globalThis.window
        ? import.meta.glob(['./meta/**/*.ts', './browser/**/*.ts'])
        : ['./meta', './browser'],
}));
