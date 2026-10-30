import {test} from 'tap';

import {forwardTarget, type IChatDispatchSettings} from './settings.ts';

/**
 * Which method an account's messages go to.
 *
 * The setting is a map because one process serves several accounts, and the fallback is what an
 * account nobody mapped gets — the realm's own drop handler in every committed configuration, so a
 * message is never dispatched to a method that does not exist. The plain-string shape is what the
 * setting was before it became per account, and an rc file written then must keep working.
 */
const settings = (forward: IChatDispatchSettings['forward']): IChatDispatchSettings => ({forward});

test('an account gets its own method, or the fallback', t => {
    const map = settings({demo: 'test.chat.received', '*': 'chat.in.message.ignore'});
    t.equal(forwardTarget(map, 'demo'), 'test.chat.received', 'the named account has its own');
    t.equal(forwardTarget(map, 'other'), 'chat.in.message.ignore', 'any other account falls back');
    t.equal(forwardTarget(map, undefined), 'chat.in.message.ignore', 'and so does an unnamed one');
    t.end();
});

test('one method for every account still works', t => {
    t.equal(
        forwardTarget(settings('chat.in.message.ignore'), 'anything'),
        'chat.in.message.ignore',
        'the shape this setting had before it was per account is read as the fallback',
    );
    t.equal(forwardTarget(undefined, 'demo'), undefined, 'and no setting answers nothing at all');
    t.end();
});
