/// <reference types="vite/client" />
/**
 * browser.ts — `$subject` realm entry point (browser platform).
 *
 * Auto-discovers the model handler (`$subject$ObjectModel`) and the fixture
 * handler (`$subjectFixture`) from the `meta/` folder, plus the browser
 * namespace orchestrator (`browser/orchestrator`).
 *
 * `meta/fixture` is globbed on purpose: the mock adapter that feeds Storybook
 * reads it by calling `blong.handler['$subjectFixture']`, and a folder the
 * browser platform never loads leaves every story empty.
 *
 * The rows do not reach the running app: `defineBlongViteConfig` replaces every
 * `meta/fixture` module with an empty handler in an app build (a glob cannot be
 * made conditional, so the build stubs what it should not ship) and Storybook
 * removes that stub. The server platform is unaffected — it scans layer folders
 * rather than globbing them.
 *
 * `meta/type` and `meta/db` are NOT globbed — they are server-side (knex table
 * definitions) and would not bundle.
 *
 * Consumed by suites that want the `$subject` domain:
 *
 *   // browser.ts
 *   async function $subject() {
 *       return import('@feasibleone/blong-$subject/browser.ts');
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
            component: true,
        },
    },
}));
