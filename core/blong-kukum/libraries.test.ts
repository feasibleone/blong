import type {IRegistry} from '@feasibleone/blong/types';
import t from 'tap';

import type {PrimitiveHost} from './engine.ts';
import activationFind from './orchestrator/kukum/activationFind.ts';
import find from './orchestrator/kukum/find.ts';
import methodFind from './orchestrator/kukum/methodFind.ts';
import primitiveFind from './orchestrator/kukum/primitiveFind.ts';
import sourceGet from './orchestrator/kukum/sourceGet.ts';
import treeFind from './orchestrator/kukum/treeFind.ts';
import {PRIMITIVES} from './primitives/index.ts';

/**
 * The `library()` bindings beside `handlers.ts` must be *thin*: they read the
 * platform and the registry off `this` when they are called, and delegate.
 *
 * `Registry._createHandlers` seeds the layer's `lib` object with `platform` and
 * `registry`, and `layerProxy` hands an attached library function back **raw** —
 * so `this` inside it is that object, not the port. Driving the factory with a
 * stub api and the returned function with a fake `this` is the only way to prove
 * the binding is thin: a value captured in the factory would still pass an
 * integration test.
 *
 * The end-to-end proof that these are the functions the gateway reaches is
 * `index.test.ts`, which drives every method over real JSON-RPC.
 */

/** A `library()` default export is the factory itself — tagged `kind: 'lib'`. */
const build = <T>(mod: unknown): T => (mod as (api: object) => T)({config: {}});

const fakeRegistry = {
    describe: () => ({
        groups: [{name: 'kukum.kukum'}],
        folders: [],
        files: [],
        realms: ['kukum'],
        ports: [],
        layerFiles: [],
    }),
} as unknown as IRegistry;

/** Enough of a platform for the bindings that only pass it straight through. */
const fakePlatform = {
    resolve: (path: string) => `/root/${path}`,
} as unknown as PrimitiveHost;

t.test('the meta bindings read the registry off `this`', async t => {
    const methods = build(methodFind) as (this: object) => {available: boolean};
    t.equal(
        methods.call({registry: fakeRegistry}).available,
        true,
        'method.find sees a registry supplied only via `this`',
    );

    const tree = build(treeFind) as (this: object) => {available: boolean};
    t.equal(
        tree.call({registry: fakeRegistry}).available,
        true,
        'tree.find sees a registry supplied only via `this`',
    );

    t.equal(
        methods.call({}).available,
        false,
        'no registry on `this` reports unavailable rather than throwing',
    );
});

t.test('the per-primitive bindings delegate with the primitive id', async t => {
    const perPrimitiveFind = build(find) as (
        this: object,
        id: string,
        params: object,
    ) => Promise<unknown>;
    await t.rejects(
        perPrimitiveFind.call({platform: fakePlatform}, 'not-a-primitive', {}),
        /Unknown primitive 'not-a-primitive'/,
        'the id reaches `operate`',
    );
});

t.test('the source binding validates before it touches the platform', async t => {
    const get = build(sourceGet) as (this: object, params: object) => unknown;
    t.throws(
        () => get.call({platform: fakePlatform}, {}),
        /source\.get requires a `path`/,
        'the params reach the operation',
    );
});

t.test('the catalogue bindings need no runtime at all', async t => {
    const primitives = build(primitiveFind) as () => Array<{id: string}>;
    t.equal(primitives().length, PRIMITIVES.length, 'primitive.find lists the catalogue');

    const activation = build(activationFind) as () => Record<string, {server?: object}>;
    t.ok(activation()['orchestrator']?.server, 'activation.find lists the orchestrator layer');
});
