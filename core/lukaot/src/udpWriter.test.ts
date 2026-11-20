/**
 * The framework's own sink: records leave a process over UDP in a batch a collector can reassemble.
 *
 * What is pinned here is only what the viewer's server depends on — that the wire carries the record
 * rather than the rendered line, that a batch header says how many packets a batch is, and that a write
 * after `close` is dropped instead of throwing into the caller (`@@D-930`).
 */

import dgram from 'node:dgram';
import {test} from 'tap';

import {createPacketHeader, HEADER_SIZE, splitPayload} from './packets.ts';
import type {LogRecord} from './record.ts';
import {createUdpWriter} from './udpWriter.ts';

/** A socket standing in for the collector, and the packets it received. */
async function collector(): Promise<{
    packets: Buffer[];
    port: number;
    close: () => Promise<void>;
}> {
    const packets: Buffer[] = [];
    const socket = dgram.createSocket('udp4');
    socket.on('message', message => packets.push(message));
    await new Promise<void>(resolve => socket.bind(0, '127.0.0.1', () => resolve()));
    const address = socket.address();
    return {
        packets,
        port: typeof address === 'object' ? address.port : 0,
        close: () => new Promise<void>(resolve => socket.close(() => resolve())),
    };
}

/** The lines the packets of one batch carry, in the order they were sent. */
function reassemble(packets: Buffer[]): string[] {
    const chunks = packets
        .map(packet => ({index: packet.readUInt16BE(8), payload: packet.subarray(HEADER_SIZE)}))
        .sort((left, right) => left.index - right.index)
        .map(part => part.payload)
        .map(String)
        .join('');
    return JSON.parse(chunks) as string[];
}

const record = {
    level: 'info',
    message: 'tcp frame',
    fields: {context: 'srv.tcp', capture: 'frameworkTcpFrame', shape: 'tcp.frame'},
} as unknown as LogRecord;

test('a batch carries the record, not the rendered line', async t => {
    const sink = await collector();
    const writer = createUdpWriter({port: sink.port, batchSize: 10});
    t.teardown(async () => {
        writer.close();
        await sink.close();
    });

    writer.write('the rendered line', record);
    writer.write('a line with no record');
    writer.flush();
    await new Promise(resolve => setTimeout(resolve, 100));

    const lines = reassemble(sink.packets);
    t.equal(lines.length, 2, 'both writes crossed the wire');
    t.same(
        JSON.parse(lines[0]!),
        record,
        'the structured record is what travelled, so a viewer can draw its fields',
    );
    t.equal(JSON.parse(lines[1]!), 'a line with no record', 'and a line-only write is not dropped');
    t.end();
});

test('a full batch is sent without waiting for the timer', async t => {
    const sink = await collector();
    const writer = createUdpWriter({port: sink.port, batchSize: 2, flushInterval: 60_000});
    t.teardown(async () => {
        writer.close();
        await sink.close();
    });

    writer.write('one');
    writer.write('two');
    await new Promise(resolve => setTimeout(resolve, 100));

    t.equal(reassemble(sink.packets).length, 2, 'the second write reached the batch size and sent');
    t.end();
});

test('a closed writer drops what is written to it', async t => {
    const sink = await collector();
    const writer = createUdpWriter({port: sink.port});
    t.teardown(() => sink.close());

    writer.close();
    writer.close();
    t.doesNotThrow(() => {
        writer.write('after close');
        writer.flush();
    }, 'closing twice, or writing after it, is not an error');
    await new Promise(resolve => setTimeout(resolve, 60));
    t.equal(sink.packets.length, 0, 'and nothing is sent');
    t.end();
});

test('a batch larger than a packet is split, and the header says how many', async t => {
    const payload = Buffer.from(JSON.stringify(['x'.repeat(200)]));
    const chunks = splitPayload(payload, 100);
    t.equal(
        chunks.length,
        Math.ceil(payload.length / 100),
        'the payload is split at the packet size',
    );

    const header = createPacketHeader(Buffer.alloc(8), 1, chunks.length);
    t.equal(header.length, HEADER_SIZE, 'the header is 12 bytes');
    t.equal(header.readUInt16BE(8), 1, 'and carries the packet index');
    t.equal(header.readUInt16BE(10), chunks.length, 'and the number of packets in the batch');

    t.same(splitPayload(Buffer.alloc(0), 100), [], 'an empty payload makes no packet');
    t.end();
});
