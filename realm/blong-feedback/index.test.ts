/**
 * index.test.ts — Tap test runner for `feedback` integration tests.
 *
 * Loads the server platform and runs the groups wired in `index.ts`
 * (`integration.watch.test`): `test.feedback.flow`. The realm owns no browser
 * tap suite — its UI is exercised by Playwright (`test/feedback.play.ts`) — so
 * there is no second platform here, the way `blong-core` runs its own flow.
 *
 * Usage:
 *   node --run ci-test    (via blong-dev test, which uses this file)
 *   node index.test.ts    (direct tap invocation)
 */
import load from '@feasibleone/blong-gogo';
import tap, {Test} from 'tap';

import serverSuite from './index.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];
const manifest: Record<string, unknown> = {};

const serverPlatform = await load(
    serverSuite,
    'blong-feedback',
    'blong-feedback',
    intents,
    manifest,
);
await serverPlatform.start({});
await tap.test('feedback flow (server)', async (test: Test) => {
    await serverPlatform.test(test);
});

/**
 * The review story runs on a fake realm, and the fake is the one thing in the
 * feature a screenshot cannot check: a stub that answers with a fixed document
 * makes the story lie about the workflow it demonstrates (`@@T-499`). So the fake
 * is exercised here, without a browser.
 */
await tap.test('the review story answers like a realm', async (test: Test) => {
    const {makeStubDispatch} = await import('./src/stories/feedbackReviewStub.ts');
    const dispatch = makeStubDispatch('data:image/jpeg;base64,AAAA');
    const open = (await dispatch('feedback.session.items', {})) as {
        items: Array<{feedbackItemId: string; refinedText?: string; callout?: {x: number}}>;
    };
    const first = open.items[0];
    const before = (await dispatch('feedback.prose.render', {})) as {document: string};

    test.equal(open.items.length, 2, 'the story opens on the fixture’s two comments');
    test.ok(
        before.document.includes('The label does not say which club'),
        'the document quotes the wording as submitted',
    );

    await dispatch('feedback.item.edit', {
        sessionId: 'cffb9037-b815-426d-8331-2091ec995b4a',
        itemId: first.feedbackItemId,
        refinedText: 'The club filter needs a label of its own.',
    });
    const edited = (await dispatch('feedback.prose.render', {})) as {document: string};
    test.ok(
        edited.document.includes('needs a label of its own'),
        'a reviewer’s wording is what the document quotes',
    );
    test.not(
        edited.document.includes('The label does not say which club'),
        'and the wording it replaced is gone',
    );

    const box = {x: 0.1, y: 0.2, width: 0.3, height: 0.25};
    await dispatch('feedback.item.edit', {
        sessionId: 'cffb9037-b815-426d-8331-2091ec995b4a',
        itemId: first.feedbackItemId,
        callout: box,
    });
    const moved = (await dispatch('feedback.session.items', {})) as {
        items: Array<{callout?: typeof box}>;
    };
    test.same(moved.items[0]?.callout, box, 'a box the reviewer moved reads back');

    await dispatch('feedback.item.edit', {
        sessionId: 'cffb9037-b815-426d-8331-2091ec995b4a',
        itemId: first.feedbackItemId,
        removed: true,
    });
    const closed = (await dispatch('feedback.prose.render', {})) as {
        document: string;
        itemCount: number;
    };
    test.equal(closed.itemCount, 1, 'a closed comment leaves the count');
    test.not(
        closed.document.includes('needs a label of its own'),
        'and leaves the document',
    );
    await dispatch('feedback.item.edit', {
        sessionId: 'cffb9037-b815-426d-8331-2091ec995b4a',
        itemId: first.feedbackItemId,
        removed: false,
    });
    const restored = (await dispatch('feedback.prose.render', {})) as {itemCount: number};
    test.equal(restored.itemCount, 2, 'restoring puts it back');
    test.end();
});
await serverPlatform.stop();
