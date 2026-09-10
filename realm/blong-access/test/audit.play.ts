/**
 * `access.audit` browse-only view — the append-only audit log is not seeded and
 * not editable from the UI; the Browse page (empty state) is asserted.
 *
 * The audit table is DYNAMIC — every login/refresh/etc. appends a row (with
 * timestamps and actor ids), so the screenshot must not capture live data.  We
 * filter the browse grid with a guaranteed-no-match term so the snapshot always
 * shows the deterministic empty state regardless of what the suite accumulated.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access Audit', () => {
    browseModel(test, expect, {
        subject: 'access',
        object: 'audit',
        // Filter to a term that no audit row can contain → deterministic empty
        // state in the `access-audit-browse` screenshot.
        searchText: 'no-match-zzzz',
    });
});
