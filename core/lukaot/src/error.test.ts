/**
 * Constructing an error signal records it, and a silent one constructs without recording.
 */

import {test} from 'tap';

import {declare} from './declare.ts';
import type {ISignalRecord} from './emit.ts';
import {createErrorEmitter, isSignalError, type ISignalError} from './error.ts';
import {createSignalProxy} from './proxy.ts';
import {createRegistry} from './registry.ts';

const registry = createRegistry(
    declare({
        log: {agentBusy: 'nothing to do'},
        error: {
            agentTicketNotFound: {message: 'Ticket {ticketId} is not in the pool', statusCode: 404},
            agentFlowExit: {message: 'Nothing left to reconcile', silent: true},
            agentEngineFailed: {
                message: 'Engine {engineAccount} failed: {reason}',
                print: 'The engine is unavailable',
                statusCode: 502,
            },
        },
    }),
);

function collect(): {records: ISignalRecord[]; write: (record: ISignalRecord) => void} {
    const records: ISignalRecord[] = [];
    return {records, write: record => records.push(record)};
}

test('one call answers one error and writes one record', async t => {
    const {records, write} = collect();
    const proxy = createSignalProxy({registry, emit: createErrorEmitter({registry, write})});
    const call = proxy.vocabulary['agentTicketNotFound'] as (
        params?: unknown,
    ) => ISignalError | undefined;
    const error = call({ticketId: 'T-7'})!;
    t.ok(error instanceof Error);
    t.equal(error.type, 'agentTicketNotFound', 'the identifier is the type');
    t.equal(error.message, 'Ticket T-7 is not in the pool');
    t.equal(error.statusCode, 404);
    t.same(error.params, {ticketId: 'T-7'}, 'the values travel with the failure');
    t.equal(records.length, 1, 'and one record was written');
    t.equal(records[0]?.kind, 'error');
    t.equal(records[0]?.level, 'error');
    t.end();
});

test('a silent signal constructs the value and writes nothing', async t => {
    const {records, write} = collect();
    const proxy = createSignalProxy({registry, emit: createErrorEmitter({registry, write})});
    const error = (proxy.vocabulary['agentFlowExit'] as (params?: unknown) => ISignalError)!()!;
    t.equal(error.silent, true);
    t.same(records, [], 'control flow is not a record');
    t.end();
});

test('a policy that names a silent signal asks for its record', async t => {
    const {records, write} = collect();
    registry.patch({agentFlowExit: {level: 'debug'}});
    const proxy = createSignalProxy({registry, emit: createErrorEmitter({registry, write})});
    (proxy.vocabulary['agentFlowExit'] as (params?: unknown) => ISignalError)!()!;
    t.equal(records.length, 1, 'the operator asked, so it is recorded');
    t.equal(records[0]?.level, 'debug');
    registry.patch({agentFlowExit: {}});
    t.end();
});

test('a cause is carried and a print is rendered', async t => {
    const {records, write} = collect();
    const proxy = createSignalProxy({registry, emit: createErrorEmitter({registry, write})});
    const call = proxy.vocabulary['agentEngineFailed'] as (
        params?: unknown,
        call?: {cause?: Error},
    ) => ISignalError;
    const underlying = new Error('connection reset');
    const error = call({engineAccount: 'deepseek', reason: 'timeout'}, {cause: underlying})!;
    t.equal(error.print, 'The engine is unavailable');
    t.equal(error.cause, underlying, 'the failure underneath is kept, not flattened');
    t.same(records.length, 1);
    t.equal(records[0]?.message, 'Engine deepseek failed: timeout');
    t.end();
});

test('a value the framework already reads is what a caller sees', async t => {
    const {write} = collect();
    const proxy = createSignalProxy({registry, emit: createErrorEmitter({registry, write})});
    const error = (proxy.vocabulary['agentTicketNotFound'] as (params?: unknown) => ISignalError)!({
        ticketId: 'T-8',
    });
    t.ok(isSignalError(error), 'and it is recognisable as a signal error');
    t.notOk(isSignalError(new Error('plain')), 'a plain error is not');
    t.end();
});
