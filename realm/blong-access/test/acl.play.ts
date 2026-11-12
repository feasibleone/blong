/**
 * `access.acl` — the ACL Rules page (Browse).
 *
 * The page lists the explicit record/scope rules of every principal. The
 * screenshot is narrowed to the seeded wildcard rules: the search runs over the
 * table's own columns, and an action name (`party.person.edit`) is joined in for
 * display rather than stored, so searching it matches nothing.
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
        // `targetKind` and `effect` of the seeded Admin grants — both `all`/`allow`,
        // and `all` is the term the page can match on.
        searchText: 'all',
    });
});
