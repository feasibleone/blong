/**
 * What a handler announced, on the answer of the call it handled (PRD R26/R27).
 *
 * The gap this closes, measured before it was closed: a realm handler announced five points and
 * one branch through `$meta.checkpoint` / `$meta.decide`, and **no record carried any of them** —
 * 0 of 5056 retained records. The handles work; the records do not. A call's records are written
 * by the framework *around* the handler (the receipt before it runs, the answer from the caller's
 * end), so the ambient scope the handler staged into never emits one, and everything it announced
 * is dropped with that scope.
 *
 * What is pinned here is the receiver's half: the adapter reads what its handler announced once
 * the handler returns and reports it on the leg it answered, which is a record the ledger already
 * matches. Two properties matter and both are asserted below — the progress is *re-announced* (so
 * the logger's own facet machinery puts it on the record, rather than a second way of writing
 * records being invented), and nothing is written when the handler announced nothing.
 */
import type {IMeta} from '@feasibleone/blong/types';
import {attachSemanticVocabulary} from '@feasibleone/semantic-log/attachable';
import * as vocabulary from '@feasibleone/semantic-log/emitter';
import t from 'tap';
import {AdapterBase} from './AdapterBase.ts';
import {createAttachCheckpoint} from './checkpoint.ts';

// The framework reaches the vocabulary by attachment (the emitter's scope is Node-only, and the
// browser bootstrap loads this module too), so a tap process attaches it exactly as `loadServer.ts`
// does. Without it the handles degrade and there is nothing to report.
attachSemanticVocabulary(vocabulary);

/** A canonical flow ULID. */
const FLOW = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

/** The leg the caller declared for the call this adapter answers. */
const LEG = 'gateway.bundle.merge';

/**
 * The `$meta` a receiver is handed, built the way the wire builds it: the identities travel in
 * the header bag, and the leg is in it because the caller declared one.
 */
function inboundMeta(): IMeta {
    const forward = vocabulary.withFlow({id: FLOW, kind: 'transfer.single'}, () =>
        vocabulary.bindLeg({id: LEG, from: 'public', to: 'gateway'}, () =>
            vocabulary.identityHeaders(),
        ),
    );
    return {mtid: 'event', method: 'exec', forward};
}

/** What the fake call channel saw, with the progress staged at the moment it was asked. */
interface ISeen {
    phase: string;
    leg: string;
    points?: unknown;
    regions?: unknown;
}

/**
 * The adapter under test: the real `handle`, on an instance built without a constructor.
 *
 * `handle` reads exactly three things — the imported handler table, the checkpoint attach hook and
 * the call channel — so those are the three that are set. The alternative, going through
 * `adapterFactory`, would drag in the registry, the schema and the config runtime to test a
 * twenty-line method.
 */
function receiver(handler: (params: unknown[]) => unknown, seen: ISeen[]) {
    const adapter = Object.create(AdapterBase.prototype) as AdapterBase<unknown, never>;
    adapter.imported = {exec: handler as never};
    adapter._attachCheckpoint = createAttachCheckpoint('debug');
    // The method-id hook is the constructor's, and it is asked before the handler is found. Identity
    // is the honest stub for a test: the real one names a method the way its realm does.
    adapter._methodId = (name: string) => name;
    (adapter as unknown as {log: unknown}).log = {
        calls: {
            enabled: () => true,
            start: () => undefined,
            end: () => undefined,
            error: () => undefined,
            received: (leg: string) => void seen.push({phase: 'received', leg}),
            // Read at the moment the answer is written, which is the whole point: what the
            // framework staged onto the scope is what the record will carry.
            answered: (leg: string) => {
                const points = vocabulary.takePoints();
                const regions = vocabulary.currentRegions();
                seen.push({
                    phase: 'answered',
                    leg,
                    ...(points ? {points} : {}),
                    ...(regions ? {regions} : {}),
                });
            },
        },
    };
    return adapter;
}

t.test('the answer of a call carries what its handler announced', async t => {
    const seen: ISeen[] = [];
    const meta = inboundMeta();
    const adapter = receiver(() => {
        meta.checkpoint?.('merge-started', {bundles: 1});
        return meta.decide?.('role-bit', {declared: null}, [
            {name: 'allocated', when: () => true, run: () => 'allocated'},
            {name: 'declared', when: () => false, run: () => 'declared'},
        ]);
    }, seen);

    const result = await adapter.handle({}, meta);
    t.equal(result, 'allocated', 'the handler answered');

    t.same(
        seen.map(event => event.phase),
        ['received', 'answered'],
        'the receiver writes a receipt when the call arrives and an answer when its work is done',
    );
    t.equal(seen[1]?.leg, LEG, 'and the answer names the leg it was handed');
    t.same(
        seen[1]?.points,
        [{name: 'merge-started', data: {bundles: 1}}],
        'the point the handler announced is staged for the answer',
    );
    t.same(
        (
            seen[1]?.regions as Array<{
                discriminator: string;
                chosen: string;
                candidates: string[];
            }>
        ).map(region => [region.discriminator, region.chosen, region.candidates]),
        [['role-bit', 'allocated', ['allocated', 'declared']]],
        'and so is the branch it took, so the block can be drawn around this hop',
    );
});

t.test('a handler that waits before it announces is still answered for', async t => {
    // The regression this pins: the collection's boxes are installed with `enterWith`, which
    // reaches the current context and what follows it — never a frame that is already suspended.
    // A handler that awaits before it announces anything resumes in a context whose boxes were
    // created after the receiver's continuation was bound, so without installing them first the
    // branch mark (and every point staged after the wait) reached no record: measured live, the
    // points survived and the branch did not.
    const seen: ISeen[] = [];
    const meta = inboundMeta();
    const adapter = receiver(async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        meta.checkpoint?.('after-the-wait');
        return meta.decide?.('role-bit', {declared: null}, [
            {name: 'allocated', when: () => true, run: () => 'allocated'},
            {name: 'declared', when: () => false, run: () => 'declared'},
        ]);
    }, seen);

    await adapter.handle({}, meta);
    t.same(
        seen.map(event => event.phase),
        ['received', 'answered'],
        'the answer is still written after a wait',
    );
    t.same(seen[1]?.points, [{name: 'after-the-wait'}], 'with the point announced after it');
    t.same(
        (
            seen[1]?.regions as Array<{
                discriminator: string;
                chosen: string;
                candidates: string[];
            }>
        ).map(region => [region.discriminator, region.chosen, region.candidates]),
        [['role-bit', 'allocated', ['allocated', 'declared']]],
        'and the branch it took, which is what the alt block is drawn from',
    );
});

t.test('a handler that announced nothing writes no answer', async t => {
    const seen: ISeen[] = [];
    const meta = inboundMeta();
    const adapter = receiver(() => ({success: true}), seen);
    await adapter.handle({}, meta);
    t.same(
        seen.map(event => event.phase),
        ['received'],
        'an uninstrumented call still pays nothing beyond its receipt',
    );
});

t.test('an untraced call records nothing at all', async t => {
    const seen: ISeen[] = [];
    const adapter = receiver(() => {
        return {success: true};
    }, seen);
    await adapter.handle({}, {mtid: 'event', method: 'exec'});
    t.same(seen, [], 'no flow on the call, so no records — the gate is asked first');
});
