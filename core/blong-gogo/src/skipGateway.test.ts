import type {IMeta} from '@feasibleone/blong/types';
import tap from 'tap';

import GatewayCodecImpl from './GatewayCodec.ts';

/**
 * `skipGateway` in its three shapes, pinned where the routing decision is made.
 *
 * A gateway is where an *outside* caller reaches a process, and `gateway()` is what answers whether a
 * call is handed to one. A method that has to be answered at home therefore has to be kept out *here*:
 * the resolver asks its own question (`remote.canSkipSocket`, `remoteCanSkip.test.ts`) only after this
 * one has let the call through, which is the order that lets a deployment route a namespace through a
 * gateway and still keep one of its own methods in-process. The framework's own session check is that
 * method — `identity.checkInternal`, asked by the process that verified the token, from inside the
 * verification — and it was a hardcoded name here until this setting replaced it (F-497).
 *
 * The codec is built for real rather than mocked: what is pinned is the answer of the public method, and
 * a stub of the class would let the two disagree. Its OIDC client discovers nothing until a token is
 * verified, so building one costs no network.
 */
const build = (config: {skipGateway?: boolean | string; gateway?: object}) =>
    new GatewayCodecImpl(
        config,
        'http',
        '8091',
        {register: () => ({})} as never,
        async () => undefined,
        undefined as never,
    );

/** The address the configured gateway answers at, as `gateway()` hands it back. */
const GATEWAY = {
    deploy: {protocol: 'http', hostname: 'the-gateway', port: '8080'},
    identity: {protocol: 'http', hostname: 'the-gateway', port: '8080'},
};

tap.test('nothing is skipped unless it is asked for', async t => {
    const codec = build({gateway: GATEWAY});
    t.same(
        codec.gateway({method: 'identity.checkInternal'} as IMeta),
        {...GATEWAY.identity, method: 'identity.checkInternal'},
        'a namespace routed through the gateway still is',
    );
    t.equal(
        codec.gateway({method: 'remote.unknown.nothing'} as IMeta),
        undefined,
        'and one the gateway does not name is not routed at all',
    );
});

tap.test('skipGateway=true keeps every call at home', async t => {
    const codec = build({gateway: GATEWAY, skipGateway: true});
    t.equal(
        codec.gateway({method: 'kustomize.deployment.find'} as IMeta),
        undefined,
        'even where the gateway names the namespace',
    );
    t.equal(
        codec.gateway({method: 'identity.checkInternal'} as IMeta),
        undefined,
        'and the session',
    );
});

tap.test('skipGateway as a pattern skips what it matches', async t => {
    const codec = build({gateway: GATEWAY, skipGateway: '^identity\\.'});
    t.equal(
        codec.gateway({method: 'identity.checkInternal'} as IMeta),
        undefined,
        'the method the framework asks of the process that verified the token',
    );
    t.same(
        codec.gateway({method: 'deploy.kustomize.deployment.find'} as IMeta),
        {...GATEWAY.deploy, method: 'deploy.kustomize.deployment.find'},
        'while the rest still goes through the gateway it is configured for',
    );
});

tap.test('the setting beats a gateway the caller asked for', async t => {
    // `$meta.gateway` is how a caller routes a call itself. A method named in `skipGateway` does not
    // take that route either: the setting says this process answers it, and a caller's preference is
    // not a reason for the session check to leave the process that holds the handshake.
    const codec = build({skipGateway: 'identity.checkInternal'});
    t.equal(
        codec.gateway({
            method: 'identity.checkInternal',
            gateway: {hostname: 'somewhere-else'},
        } as IMeta),
        undefined,
        'the skip wins',
    );
    t.same(
        codec.gateway({method: 'other.method', gateway: {hostname: 'somewhere-else'}} as IMeta),
        {hostname: 'somewhere-else', method: 'other.method'},
        'and a call it does not name keeps the route it was given',
    );
});

tap.test('a skip that is not a regular expression skips nothing', async t => {
    // `(` throws when it is compiled, and a broken pattern must not decide that no call is ever routed:
    // treated as nothing matching, which leaves the gateway doing what it did.
    const codec = build({gateway: GATEWAY, skipGateway: '('});
    t.same(
        codec.gateway({method: 'identity.checkInternal'} as IMeta),
        {...GATEWAY.identity, method: 'identity.checkInternal'},
        'the call is routed as it would have been',
    );
    t.ok(
        codec.gateway({method: 'deploy.kustomize.deployment.find'} as IMeta),
        'and keeps routing, not throwing',
    );
});
