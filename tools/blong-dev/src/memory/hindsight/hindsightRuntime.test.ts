import {test} from 'tap';

import {resolveHindsight, setHindsightStoreFactory} from './hindsightRuntime.ts';

/**
 * The index is off in a test process (`@@F-841`).
 *
 * The suite writes entries into throwaway repositories, and the write path pushes them into the
 * index; with the real store in place that is the developer's own bank, and the next real search
 * answers from fixtures. Tap marks its children, so the default factory is what turns it off — and a
 * case that wants a bank says so with `setHindsightStoreFactory`, which this also pins.
 */
test('a test process does not reach a real bank, and an installed store still wins', async t => {
    setHindsightStoreFactory(null);
    t.teardown(() => setHindsightStoreFactory(null));

    t.equal(process.env['TAP'], '1', 'the suite runs under tap, so the default applies');
    t.equal(resolveHindsight().store, null, 'the default factory builds no store here');

    const fake = {url: 'http://test:8888', bank: 'test'};
    setHindsightStoreFactory(() => fake as never);
    t.equal(resolveHindsight().store, fake, 'and a case that installs one gets it');

    setHindsightStoreFactory(null);
    t.equal(resolveHindsight().store, null, 'restoring the default goes back offline');
    t.end();
});
