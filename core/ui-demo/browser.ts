/**
 * ui-demo browser — reference suite browser entry point.
 *
 * Demonstrates the blong-ui framework consuming server APIs
 * to auto-generate forms, tables and detail views.
 */

import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [],
    config: {
        default: {},
        dev: {},
    },
}));
