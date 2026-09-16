/**
 * `access.acl` — the ACL Rules page (Browse).
 *
 * The page lists the explicit record/scope rules of every principal, so the
 * screenshot is filtered to a single seeded action to keep it stable.
 *
 * It deliberately has no create/edit test: an ACL row is unique per
 * (principal, action, target), a re-run would collide, and the rows it would
 * have to delete for cleanup include seeded ones the other suites rely on.  The
 * write path is covered by the tap suites instead — `test.acl.flow` in
 * `realm/blong-party` and the ACL model flow in `realm/blong-access`.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access ACL Rules', () => {
    browseModel(test, expect, {
        subject: 'access',
        object: 'acl',
        searchText: 'party.person.edit',
    });
});
