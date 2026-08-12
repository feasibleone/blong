/**
 * Tests for the ApiGateway metering plugin — header injection, blocking status
 * codes, fail-closed 503, and passthrough for non-metered routes — via Fastify
 * injection (modeled on RestFs.test.ts).
 */

import assert from 'node:assert';
import {after, describe, it} from 'node:test';

import fastify, {type FastifyInstance} from 'fastify';

import ApiGateway from './ApiGateway.ts';

type MeterFn = (params: {bundle: string; creditCost: number}, $meta: unknown) => Promise<unknown>;

interface SetupResult {
    server: FastifyInstance;
    cleanup: () => Promise<void>;
}

/**
 * Build a Fastify instance with the ApiGateway plugin registered plus a
 * metered route, a non-metered route and an opted-out route.
 */
async function setup(
    meterFn: MeterFn,
    opts?: {handlerUnavailable?: boolean},
): Promise<SetupResult> {
    let capturedPlugin: Parameters<FastifyInstance['register']>[0] | null = null;
    let capturedOptions: Parameters<FastifyInstance['register']>[1] | null = null;
    const fakeGateway = {
        registerPlugin(plugin: typeof capturedPlugin, opts: typeof capturedOptions) {
            capturedPlugin = plugin;
            capturedOptions = opts;
        },
    };
    const fakeLocal = {
        get(_name: string): {method: (...args: unknown[]) => Promise<unknown[]>} | undefined {
            if (opts?.handlerUnavailable) return undefined;
            return {
                method: async (...args: unknown[]) => [
                    await meterFn(args[0] as {bundle: string; creditCost: number}, args[1]),
                    undefined,
                ],
            };
        },
    };

    const apiGateway = new ApiGateway(
        {
            enabled: true,
            meterHandler: 'gateway.meter.check',
            statusCodes: {rate: 429, credits: 429, subscription: 403},
        },
        {gateway: fakeGateway as never, local: fakeLocal as never},
    );
    await apiGateway.init();

    const server = fastify();
    server.addHook('preValidation', (_req, _reply, done) => done());
    if (capturedPlugin) await server.register(capturedPlugin, capturedOptions!);

    server.route({
        method: 'POST',
        url: '/rpc/vision/compute',
        config: {auth: 'jwt', bundle: 'Vision AI', creditCost: 5},
        handler: async () => ({success: true, vision: 'computed'}),
    });
    server.route({
        method: 'POST',
        url: '/rpc/plain/echo',
        handler: async () => ({ok: true}),
    });
    server.route({
        method: 'POST',
        url: '/rpc/opt/out',
        config: {auth: 'jwt', bundle: 'Vision AI', creditCost: 5, meter: false},
        handler: async () => ({ok: true}),
    });

    await server.ready();
    return {server, cleanup: () => server.close()};
}

const okDecision = {
    allowed: true,
    reason: 'ok',
    creditsRemaining: 995,
    rateLimit: 100,
    rateCount: 1,
    rateResetAt: 123456,
};

describe('ApiGateway metering plugin', () => {
    after(() => {});

    it('allows a metered route and injects the rate/credit headers', async () => {
        const {server, cleanup} = await setup(async () => okDecision);
        try {
            const res = await server.inject({method: 'POST', url: '/rpc/vision/compute'});
            assert.strictEqual(res.statusCode, 200);
            // Fastify lowercases header names: X-RateLimit-Limit → x-ratelimit-limit
            assert.strictEqual(res.headers['x-ratelimit-limit'], '100');
            assert.strictEqual(res.headers['x-ratelimit-remaining'], '99');
            assert.strictEqual(res.headers['x-credits-remaining'], '995');
            assert.deepStrictEqual(res.json(), {success: true, vision: 'computed'});
        } finally {
            await cleanup();
        }
    });

    it('blocks with 429 when the meter denies (rate limit)', async () => {
        const {server, cleanup} = await setup(async () => ({
            allowed: false,
            reason: 'rate',
            creditsRemaining: -1,
            rateLimit: 100,
            rateCount: 101,
            rateResetAt: 9999,
        }));
        try {
            const res = await server.inject({method: 'POST', url: '/rpc/vision/compute'});
            assert.strictEqual(res.statusCode, 429);
            assert.strictEqual(res.headers['retry-after'], '1');
            assert.strictEqual((res.json() as {error: string}).error, 'rate');
        } finally {
            await cleanup();
        }
    });

    it('blocks with 403 when the subscription is missing', async () => {
        const {server, cleanup} = await setup(async () => ({
            allowed: false,
            reason: 'subscription',
            creditsRemaining: -1,
        }));
        try {
            const res = await server.inject({method: 'POST', url: '/rpc/vision/compute'});
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual((res.json() as {error: string}).error, 'subscription');
        } finally {
            await cleanup();
        }
    });

    it('returns 503 (fail-closed) when the meter handler throws', async () => {
        const {server, cleanup} = await setup(async () => {
            throw new Error('Redis unavailable');
        });
        try {
            const res = await server.inject({method: 'POST', url: '/rpc/vision/compute'});
            assert.strictEqual(res.statusCode, 503);
            assert.strictEqual((res.json() as {error: string}).error, 'Service Unavailable');
        } finally {
            await cleanup();
        }
    });

    it('returns 503 (fail-closed) when the meter handler is unavailable', async () => {
        const {server, cleanup} = await setup(async () => okDecision, {handlerUnavailable: true});
        try {
            const res = await server.inject({method: 'POST', url: '/rpc/vision/compute'});
            assert.strictEqual(res.statusCode, 503);
        } finally {
            await cleanup();
        }
    });

    it('passes through routes without a bundle config', async () => {
        const {server, cleanup} = await setup(async () => okDecision);
        try {
            const res = await server.inject({method: 'POST', url: '/rpc/plain/echo'});
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.json(), {ok: true});
        } finally {
            await cleanup();
        }
    });

    it('passes through routes opted out with meter: false', async () => {
        const {server, cleanup} = await setup(async () => okDecision);
        try {
            const res = await server.inject({method: 'POST', url: '/rpc/opt/out'});
            assert.strictEqual(res.statusCode, 200);
            assert.deepStrictEqual(res.json(), {ok: true});
        } finally {
            await cleanup();
        }
    });
});
