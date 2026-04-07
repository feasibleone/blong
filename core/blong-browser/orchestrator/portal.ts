/**
 * orchestrator/portal.ts — built-in browser-side portal orchestrator.
 *
 * Dispatches portal.* calls to individual handlers in orchestrator/portal/.
 * Imports component handlers, portal configs, and action metadata from all
 * realm browser layers (matched by regex), plus the ui.portal handler group.
 */
import { orchestrator } from '@feasibleone/blong';

export default orchestrator(blong => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: 'portal',
            imports: [/\.component$/, /\.portal$/, /\.actions?$/, 'ui.portal'],
        },
    },
}));

