/**
 * marine/browser.ts — marine biology demonstration realm.
 *
 * Contributes component handlers, action metadata, and an orchestrator to
 * the blong-browser registry.  The auto-discovery mechanism picks up:
 *
 *   component/  — coral/habitat/species/family component handlers
 *   actions/    — action metadata for all marine interactions
 *   orchestrator/ — dispatch orchestrator forwarding to backend/marine.*
 */
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    config: {
        default: {},
    },
}));
