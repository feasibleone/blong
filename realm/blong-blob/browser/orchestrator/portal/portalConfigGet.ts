import {handler} from '@feasibleone/blong';

/**
 * `portalConfigGet` — the one thing the shell needs to know about this realm.
 *
 * A stored file is read by the browser from a plain `<img>` or `<a>`, and the route behind it reads a
 * cookie rather than the session's bearer token: no call is made, so nothing vouches for the read on
 * its own. `blong-browser` therefore asks the portal configuration which method mints that cookie and
 * calls it once per session and again when the reader's authority changes (`@@D-836`). Naming
 * `blob.scope.issue` here is what makes a suite that attaches this realm get the cookie without
 * configuring anything — and a suite that does not attach it has no block and makes no call.
 *
 * The name is the hook the shell looks for, which is why this handler is not a semantic triple: the
 * same reason the feedback realm's review page carries it.
 *
 * The folder is `portal` because that is how the shell finds it: `blong-browser`'s portal port imports
 * handlers whose group name ends in `.model`, `.component`, `.portal` or `.action`, so this file in a
 * `scope/` group was merged into the realm, exported the hook, and never asked — the page rendered its
 * picker, uploaded a file, and could not draw it, with no error naming the portal (`@@F-740`).
 */
export default handler(() => ({
    async portalConfigGet() {
        return {
            blob: {
                issue: 'blob.scope.issue',
            },
        };
    },
}));
