/**
 * The `lib` a handler is built with (PRD R26).
 *
 * `blongLib` is spread into `lib` first, so a name the library exports cannot silently
 * replace a handle the framework injects: `blongLib` exports `snapshot` (a chain step) and
 * used to export `checkpoint` for it, an unrelated thing that shares a word with the
 * runtime's milestone handle, so the spread used to sit after the injections. The order
 * is the invariant, so it is pinned here rather than left to a comment — together with
 * the mode-gated `assert`, the other member whose presence the mode decides.
 */
import * as blongLib from '@feasibleone/blong-lib';
import type {ILib} from '@feasibleone/blong/types';
import {vocabulary} from '@feasibleone/semantic-log/attachable';
import t from 'tap';
import Registry from './Registry.ts';

// Minimal stand-ins: `_createHandlers` only reads the error factory, the platform's
// timing and the api schema, and closes over the rest.
const components = {
    log: {logger: () => ({info() {}, error() {}, warn() {}, debug() {}})},
    error: {register: () => () => undefined},
    rpcServer: {},
    remote: {remote: () => ({})},
    gateway: {},
    local: {},
    resolution: {},
    watch: {},
    apiSchema: {},
    platform: {context: {}, timing: () => undefined},
};

/** Run one handler through the factory and hand back the `lib` it was given. */
async function captureLib(mode: 'test' | 'debug' | 'production'): Promise<ILib> {
    const registry = new Registry({checkpointMode: mode}, components as never);
    let lib: ILib | undefined;
    await (
        registry as unknown as {
            _createHandlers(handlers: unknown, port: object | undefined): Promise<unknown>;
        }
    )._createHandlers(
        [
            async (params: {lib: ILib}) => {
                lib = params.lib;
            },
        ],
        undefined,
    );
    if (lib === undefined) {
        throw new Error('the handler factory was not called');
    }
    return lib;
}

t.test('a handler is handed the framework branch helper, not a name the library owns', async t => {
    const lib = await captureLib('test');
    t.type(lib.decide, 'function', 'the branch helper is always injected');
    t.equal(
        lib.decide,
        vocabulary.decide,
        'and it is the attachable one, so a realm needs no dependency on the log library',
    );
    t.equal(lib.checkpoint, vocabulary.point, 'the milestone handle is the ambient one');
    t.notOk(
        'checkpoint' in blongLib,
        'the library does not define that name, so the spread cannot replace it',
    );
    t.notOk('decide' in blongLib, 'nor the branch helper');
    t.notOk('assert' in blongLib, 'nor the assertion handle');
    t.end();
});

t.test('checkpoint follows the mode, while decide is always there', async t => {
    t.type((await captureLib('test')).checkpoint, 'function', 'test mode reports points');
    t.type((await captureLib('debug')).checkpoint, 'function', 'debug mode reports them too');
    t.equal(
        (await captureLib('production')).checkpoint,
        undefined,
        'and production leaves the slot empty, so `lib.checkpoint?.()` is one call',
    );
    t.type(
        (await captureLib('production')).decide,
        'function',
        'a branch is selected in production as anywhere else',
    );
    t.end();
});

t.test('assert is there only where a failure may be expected', async t => {
    t.type((await captureLib('test')).assert, 'function', 'test mode asserts');
    t.type((await captureLib('debug')).assert, 'function', 'debug mode asserts too');
    t.equal(
        (await captureLib('production')).assert,
        undefined,
        'and production leaves the slot empty, so `lib.assert?.(…)` is one call',
    );
    t.end();
});
