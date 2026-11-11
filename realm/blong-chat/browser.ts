/// <reference types="vite/client" />
import {realm} from '@feasibleone/blong';

/**
 * browser.ts — the `chat` realm's browser entry point.
 *
 * It loads the model page and the namespace registration, and nothing else: the account page is a
 * model, so the components it uses belong to `blong-browser`. `meta/fixture` is globbed because the
 * mock adapter reads it by name for Storybook; the app build replaces it with an empty handler, so
 * the sample credentials never reach a deployment.
 */
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
