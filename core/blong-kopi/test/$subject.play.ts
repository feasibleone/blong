/**
 * `$subject.$object` CRUD — Browse, Create, Edit full-stack tests.
 *
 * `cleanupModel` deletes test-created rows (`ENT-PLAY-*`) left over from
 * previous runs so the unique `$objectName` constraint does not trip on
 * re-runs; `browseModel` filters to the stable seeded marker so test-created
 * rows never leak into the baseline screenshot.
 *
 * TROUBLESHOOTING: if create/edit fails at login while browse passes, check the
 * Playwright trace (under `.playwright` results) for a 502 on
 * `/rpc/login/.well-known/mle` — that is dev-server (`blong-watch`) restart
 * instability, not a test bug.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    browseModel,
    cleanupModel,
    createAndEditModel,
} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('$Object', () => {
    cleanupModel(test, expect, {
        subject: '$subject',
        object: '$object',
        search: 'ENT-PLAY',
        removeMethod: '$subject.$object.remove',
    });

    browseModel(test, expect, {
        subject: '$subject',
        object: '$object',
        searchText: 'Sample $Object One',
    });

    createAndEditModel(test, expect, {
        subject: '$subject',
        object: '$object',
        fields: {
            '$object.$objectName': 'ENT-PLAY-001',
            '$object.$objectStatus': 'Sent',
        },
        editFields: {
            '$object.$objectName': 'ENT-PLAY-001 Edited',
        },
        search: 'ENT-PLAY-001',
    });
});
