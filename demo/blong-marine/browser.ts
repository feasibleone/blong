/// <reference types="vite/client" />
/**
 * blong-marine/browser.ts — Marine biology shared realm entry point.
 *
 * Auto-discovers the model handlers (marineCoralModel, etc.) and the fixture
 * handler (marineFixture) from the `meta/` folder, plus the forwarding
 * orchestrator.
 *
 * `meta/fixture` is globbed on purpose: the browser platform loads a realm only
 * through the children it is given (the server scans layer folders, the browser
 * cannot), so the fixture the mock adapter reads with
 * `blong.handler['marineFixture']` has to be listed or every Storybook story —
 * here and in blong-suite, which composes this realm — renders empty. The rows
 * themselves stay out of the running app: `defineBlongViteConfig` stubs every
 * `meta/fixture` module in an app build and Storybook removes that stub.
 *
 * `meta/type` and `meta/db` are NOT globbed: they are server-side (knex table
 * definitions) and would not bundle.
 *
 * Consumed by suites that want the marine biology domain:
 *
 *   // browser.ts
 *   async function marine() {
 *       return import('@feasibleone/blong-marine/browser.ts');
 *   }
 */
import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    children: globalThis.window
        ? import.meta.glob([
              './meta/model/**/*.ts',
              './meta/fixture/**/*.ts',
              './browser/orchestrator/**/*.ts',
          ])
        : ['./meta/model', './meta/fixture', './browser/orchestrator'],
    config: {
        default: {
            meta: true,
            orchestrator: true,
        },
    },
}));
