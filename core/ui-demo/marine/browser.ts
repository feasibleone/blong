/**
 * marine/browser.ts — Marine biology realm for ui-demo.
 *
 * Delegates to the shared @feasibleone/blong-marine package, which owns all
 * model specs, fixture data (YAML), and the forwarding orchestrator.
 *
 * To add ui-demo-specific overrides (e.g. a local dev backend URL), extend
 * the config block here rather than modifying the shared package.
 */
export {default} from '@feasibleone/blong-marine/browser.ts';
