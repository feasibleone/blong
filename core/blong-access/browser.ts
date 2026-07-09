/// <reference types="vite/client" />
/**
 * blong-access/browser.ts — RBAC access control realm entry point.
 *
 * Auto-discovers schema definitions and DB config from the `meta/` folder.
 *
 * Consumed by suites that need user profiles, credentials, RBAC roles,
 * capabilities, actions, policies, access flows, and audit logging.
 */
import {realm} from '@feasibleone/blong';

export default realm(() => ({
    url: import.meta.url,
    children: globalThis.window
        ? import.meta.glob(['./meta/**/*.ts', './browser/**/*.ts'])
        : ['./meta', './browser'],
}));
