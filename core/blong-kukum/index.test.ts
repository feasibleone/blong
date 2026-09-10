/**
 * index.test.ts — tap runner for the kukum realm.
 *
 * Loads the server platform (kukum has no browser entry — it is server-side
 * tooling), runs the realm's `integration.watch.test` groups, and then exercises
 * the meta endpoints over the real gateway so the routing, the generated
 * validation record and the handler map are all covered — not just the
 * operations they call.
 */
import load from '@feasibleone/blong-gogo';
import tap, {Test} from 'tap';

import serverSuite from './index.ts';

const intents = ['microservice', 'integration', 'dev', ...(process.env.CI ? ['ci'] : [])];
const manifest: Record<string, unknown> = {};

const serverPlatform = await load(serverSuite, 'blong-kukum', 'blong-kukum', intents, manifest);
await serverPlatform.start({});

await tap.test('kukum (server)', async (test: Test) => {
    await serverPlatform.test(test);
});

await tap.test('kukum meta endpoints over the gateway', async (test: Test) => {
    const port = await (manifest.gatewayPort as Promise<number> | number);
    const base = `http://127.0.0.1:${port}/rpc`;

    const call = async (method: string, params: object = {}): Promise<unknown> => {
        const response = await fetch(`${base}/${method.replaceAll('.', '/')}`, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
        });
        const body = (await response.json()) as {result?: unknown; error?: {message: string}};
        test.equal(response.status, 200, `${method} responded 200`);
        if (body.error) test.fail(`${method} errored: ${body.error.message}`);
        return body.result;
    };

    const primitives = (await call('kukum.primitive.find')) as {id: string}[];
    test.ok(Array.isArray(primitives) && primitives.length >= 10, 'catalogue is listed');
    test.ok(
        primitives.some(primitive => primitive.id === 'handler'),
        'catalogue includes the handler primitive',
    );

    const activation = (await call('kukum.activation.find')) as Record<string, {server?: object}>;
    test.ok(activation['orchestrator']?.server, 'activation table exposes the orchestrator layer');

    // These two need the live registry, which is exactly what used to be missing.
    const methods = (await call('kukum.method.find')) as {
        available: boolean;
        groups?: {name: string}[];
    };
    test.equal(methods.available, true, 'method.find reached the live registry');
    test.ok(
        methods.groups?.some(group => group.name === 'kukum.kukum'),
        'method.find reports the kukum handler group',
    );

    const tree = (await call('kukum.tree.find')) as {available: boolean; realms?: unknown[]};
    test.equal(tree.available, true, 'tree.find reached the live registry');
    test.ok((tree.realms?.length ?? 0) > 0, 'tree.find reports at least one realm');

    const instructions = (await call('kukum.instruction.find', {target: '.'})) as {
        files: unknown[];
    };
    test.ok(Array.isArray(instructions.files), 'instruction.find returns a file list');

    const checked = (await call('kukum.source.check', {target: '.', files: ['engine.ts']})) as {
        diagnostics?: {skipped?: string; errors: number};
    };
    test.ok(checked.diagnostics, 'source.check returned a diagnostics report');
    test.equal(checked.diagnostics?.errors, 0, 'engine.ts has no lint errors');

    // A PER-PRIMITIVE method, unlike everything above: those are fixed methods
    // whose handler delegates with `api[name](params)`. These go through the
    // generated map, and the binding has to be called ON the lib object or
    // `this.platform` is undefined inside it — which no fixed method would
    // notice. `get` plans without writing, so it is safe to call.
    const planned = (await call('kukum.handler.get', {
        subject: 'demo',
        object: 'thing',
        params: {predicate: 'check'},
    })) as {files?: Array<{path: string}>};
    test.ok(
        planned.files?.some(file => file.path.endsWith('demoThingCheck.ts')),
        'a per-primitive method reaches the platform through its library binding',
    );
    test.end();
});

await serverPlatform.stop();
