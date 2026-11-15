import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/** What `portalConfigGet` answers, as far as this test cares. */
type PortalConfig = {blob?: {issue?: string}};

/**
 * `test.portalScope` — the name the portal shell is told, so it can mint the read cookie.
 *
 * A stored file is read from a plain `<img>` or `<a>`, so the read is a route rather than a call and
 * nothing vouches for it but a cookie. `blong-browser` asks the portal configuration which method
 * mints that cookie and calls it once per session (`@@D-836`); the realm owes the name, and this group
 * is what proves the name is the one the shell looks for.
 *
 * The mint itself is `test.scope` (`server/test`), which calls it through the real port. The gateway's
 * authorization for it is the suite's claims, so a suite that runs the shell must grant it (`@@T-678`).
 *
 * Registered as the `test.portalScope` group (`browser-test.ts`).
 */
export default handler(({lib: {group}, handler: {portalConfigGet}}) => ({
    testPortalScope: () =>
        group('portalScope')([
            async function thePortalNamesTheMintingMethod(assert: IAssert) {
                const config = (await portalConfigGet({}, {} as IMeta)) as PortalConfig;
                assert.equal(
                    config.blob?.issue,
                    'blob.scope.issue',
                    'the portal configuration names the method that mints the cookie',
                );
                return config;
            },
        ]),
}));
