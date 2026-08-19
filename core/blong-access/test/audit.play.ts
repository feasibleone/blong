/**
 * `access.audit` browse-only view — the append-only audit log is not seeded and
 * not editable from the UI; the Browse page (empty state) is asserted.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access Audit', () => {
    browseModel(test, expect, {
        subject: 'access',
        object: 'audit',
    });
});
