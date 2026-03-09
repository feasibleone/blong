import {server, type IRegistry} from '@feasibleone/blong';
import load from '@feasibleone/blong-gogo';
import tap from 'tap';

const makeTestServer = () =>
    server(blong => ({
        url: import.meta.url,
        validation: blong.type.Object({}),
        children: [
            async function nscfg() {
                return import('./nscfg/server.ts');
            },
        ],
        config: {
            default: {nscfg: {}},
        },
    }));

type HandlerFactory = (ctx: object) => Promise<void>;

async function callHandler(
    registry: IRegistry,
    methodId: string,
    handlerName: string,
): Promise<unknown> {
    const factories = registry.methods.get(methodId) as HandlerFactory[];
    tap.ok(factories?.length, `handler factories for '${methodId}' should be registered`);
    const local: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
    const lib: object = {};
    for (const factory of factories) {
        await factory({
            remote: () => () => Promise.resolve({}),
            lib,
            local,
            literals: [],
            port: undefined,
            gateway: undefined,
        });
    }
    const fn = local[handlerName.toLowerCase()];
    tap.ok(fn, `handler function '${handlerName}' should be in local`);
    return fn({}, {});
}

await tap.test('namespace config: config.ts provides default handler config', async t => {
    const registry = await load(makeTestServer(), 'test', {}, ['default']);
    const result = (await callHandler(registry, 'nscfg.cfg', 'cfgGet')) as {
        source: string;
        extra: string;
    };

    t.equal(result.source, 'folder-config', 'source should come from config.ts');
    t.equal(result.extra, 'extra-from-folder', 'extra key from config.ts should be present');
    await registry.stop();
});

await tap.test('namespace config: namespace override replaces config.ts values', async t => {
    const registry = await load(makeTestServer(), 'test', {}, ['default', 'override']);
    const result = (await callHandler(registry, 'nscfg.cfg', 'cfgGet')) as {
        source: string;
        extra: string;
    };

    t.equal(result.source, 'namespace-override', 'source should be overridden via namespace');
    t.equal(
        result.extra,
        'extra-from-folder',
        'extra key from config.ts should be preserved after override',
    );
    await registry.stop();
});
