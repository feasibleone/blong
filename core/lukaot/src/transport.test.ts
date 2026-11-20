/**
 * The transport writes one record two ways from one shape, and retains it while it does.
 */

import {test} from 'tap';

import type {RecordStore} from './cache.ts';
import {declare} from './declare.ts';
import type {ISignalRecord} from './emit.ts';
import {createRegistry} from './registry.ts';
import {createTransport} from './transport.ts';

const registry = createRegistry(
    declare({log: {agentTicketSkipped: {level: 'warn', message: 'x'}}}),
);

const record: ISignalRecord = {
    signal: 'agentTicketSkipped',
    kind: 'log',
    level: 'warn',
    message: 'ticket t1 was skipped: already claimed',
    params: {ticketId: 't1'},
    identity: {trace: 'trace-1'},
    time: 1700000000000,
};

/** A destination that keeps what pino writes to it. */
function sink(): {chunks: string[]; destination: {write: (chunk: string) => void}} {
    const chunks: string[] = [];
    return {chunks, destination: {write: (chunk: string) => chunks.push(chunk)}};
}

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('json mode hands pino the structured record', async t => {
    const {chunks, destination} = sink();
    const transport = createTransport({registry, format: 'json', destination, now: () => 1});
    transport.write(record);
    await settle();
    const written = chunks.join('');
    t.match(written, /"signal":"agentTicketSkipped"/, 'the identifier travels');
    t.match(written, /"level":"warn"/, 'at the level in force');
    t.match(written, /"trace":"trace-1"/, 'with the ambient identity');
    t.match(written, /"params":\{"ticketId":"t1"\}/, 'and the values as they were supplied');
    await transport.close();
    t.end();
});

test('human mode writes the readable line, not the json', async t => {
    const {chunks, destination} = sink();
    const transport = createTransport({registry, format: 'human', destination, now: () => 1});
    transport.write(record);
    await settle();
    const written = chunks.join('');
    t.match(written, /ticket t1 was skipped: already claimed/, 'the message is the line');
    t.notMatch(written, /"signal":/, 'and the structure is not printed beside it');
    await transport.close();
    t.end();
});

test('a record is retained as it is written', async t => {
    let retained = 0;
    const store = {put: async () => void (retained += 1)} as unknown as RecordStore;
    const {destination} = sink();
    const transport = createTransport({registry, format: 'json', destination, store, now: () => 1});
    transport.write(record);
    await settle();
    t.equal(retained, 1, 'the printed record is the retained one');
    await transport.close();
    t.end();
});
