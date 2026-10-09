/// <reference types="vite/client" />
/**
 * browser.ts — `kustomize` realm entry point (browser platform).
 *
 * Auto-discovers the model handler (`kustomizeDeploymentModel`) and the fixture
 * handler (`kustomizeFixture`) from the `meta/` folder, plus the browser
 * namespace orchestrator (`browser/orchestrator`).
 *
 * `meta/fixture` is globbed on purpose: the mock adapter that feeds Storybook
 * reads it by calling `blong.handler['kustomizeFixture']`, and a folder the
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
 * Consumed by suites that want the `kustomize` domain:
 *
 *   // browser.ts
 *   async function kustomize() {
 *       return import('@feasibleone/blong-kustomize/browser.ts');
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
