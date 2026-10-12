import {
    type IErrorFactory,
    type ILocal,
    type ILog,
    type IPlatformApi,
} from '@feasibleone/blong/types';
import tap from 'tap';

import RemoteImpl from './Remote.ts';

/**
 * `canSkipSocket` in its three shapes each: all, none, and the pattern in between.
 *
 * A process that carries a whole suite answers most of what it can reach, and one that carries a single
 * realm has no reason to answer anything — but a process that serves some of what it can reach and has
 * to send the rest out is neither: the pattern is the middle, read against the method name, and as a
 * *source* rather than a `RegExp` because a config is data.
 *
 * The check is `protected` so this can pin it: the alternative is a transport, and a test that dials
 * localhost asserts on a machine's state rather than on the code. What it does *not* pin is when the
 * question is asked — a configured gateway claims the call first, and a method kept out of the gateway
 * is the codec's business (`skipGateway.test.ts`) — which is why nothing here is about gateways.
 */
class Probe extends RemoteImpl {
    public answers(methodName: string | undefined): boolean {
        return this.canAnswerLocally(methodName);
    }
}

const build = (canSkipSocket: boolean | string): Probe =>
    new Probe(
        {canSkipSocket},
        {
            log: {logger: () => ({warn: () => undefined})} as unknown as ILog,
            error: {register: () => ({})} as unknown as IErrorFactory,
            local: {get: () => undefined, register: () => undefined} as unknown as ILocal,
            platform: {} as unknown as IPlatformApi,
        },
    );

tap.test('canSkipSocket=true answers any method', async t => {
    const probe = build(true);
    t.equal(probe.answers('kustomize.deployment.find'), true, 'a realm method');
    t.equal(probe.answers('subject.object.schema'), true, 'another namespace');
    t.equal(probe.answers(undefined), true, 'and the end of the scale is not a pattern');
});

tap.test('canSkipSocket=false answers none', async t => {
    const probe = build(false);
    t.equal(probe.answers('kustomize.deployment.find'), false, 'a realm method travels');
    t.equal(probe.answers(undefined), false, 'and a nameless call travels');
});

tap.test('canSkipSocket as a pattern answers what it matches', async t => {
    const probe = build('^(kustomize|srv)\\.');
    t.equal(probe.answers('kustomize.deployment.find'), true, 'the realm serves this one');
    t.equal(probe.answers('srv.db.queryBuilder'), true, 'and this one');
    t.equal(
        probe.answers('access.user.find'),
        false,
        'while another namespace is sent out, which is what the pattern is for',
    );
    t.equal(probe.answers(undefined), false, 'and a nameless call travels');
});

tap.test('canSkipSocket that is not a regular expression answers none', async t => {
    // `(` on its own throws when it is compiled. Reported, and treated as nothing matching: a typo in
    // a config must not decide where every call goes.
    const probe = build('(');
    t.equal(probe.answers('kustomize.deployment.find'), false, 'the call travels');
    t.equal(
        probe.answers('kustomize.deployment.find'),
        false,
        'and keeps travelling, not throwing',
    );
});
