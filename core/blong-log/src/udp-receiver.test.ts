/**
 * Tests for the UDP transport and receiver.
 */

import dgram from 'node:dgram';
import {test} from 'tap';
import {UdpReceiver} from './udp-receiver.js';

test('UdpReceiver', async t => {
    t.test('receives and reassembles single-packet batch', async t => {
        const receiver = new UdpReceiver({port: 0, host: '127.0.0.1'});
        const receivedEntries: unknown[] = [];

        receiver.on('entry', (entry: unknown) => {
            receivedEntries.push(entry);
        });

        // Start receiver and get actual port
        await receiver.start();
        const port = receiver['#socket']?.address?.()?.port;

        // The receiver binds to port 0 so we need to get the actual port
        // For testing, use a known port
        await receiver.stop();

        // Start on specific port
        const testReceiver = new UdpReceiver({port: 19999, host: '127.0.0.1'});
        const entries: Record<string, unknown>[] = [];

        testReceiver.on('entry', (entry: Record<string, unknown>) => {
            entries.push(entry);
        });

        await testReceiver.start();

        // Create and send a batch
        const socket = dgram.createSocket('udp4');
        const batchId = Buffer.alloc(8, 0x42);
        const payload = JSON.stringify([
            JSON.stringify({level: 30, msg: 'test message 1'}),
            JSON.stringify({level: 40, msg: 'test message 2'}),
        ]);
        const payloadBuf = Buffer.from(payload);

        // Create packet: 8 bytes batchId + 2 bytes index(0) + 2 bytes total(1) + payload
        const header = Buffer.alloc(12);
        batchId.copy(header, 0);
        header.writeUInt16BE(0, 8); // packet index
        header.writeUInt16BE(1, 10); // total packets
        const packet = Buffer.concat([header, payloadBuf]);

        await new Promise<void>((resolve, reject) => {
            socket.send(packet, 0, packet.length, 19999, '127.0.0.1', err => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Wait for entry processing
        await new Promise(r => setTimeout(r, 200));

        t.equal(entries.length, 2);
        t.equal(entries[0].msg, 'test message 1');
        t.equal(entries[1].msg, 'test message 2');

        socket.close();
        await testReceiver.stop();
    });

    t.test('receives and reassembles multi-packet batch', async t => {
        const testReceiver = new UdpReceiver({port: 19998, host: '127.0.0.1'});
        const entries: Record<string, unknown>[] = [];

        testReceiver.on('entry', (entry: Record<string, unknown>) => {
            entries.push(entry);
        });

        await testReceiver.start();

        const socket = dgram.createSocket('udp4');
        const batchId = Buffer.alloc(8, 0x43);

        // Split payload across 2 packets
        const fullPayload = JSON.stringify([JSON.stringify({level: 30, msg: 'multi-packet test'})]);
        const payloadBuf = Buffer.from(fullPayload);
        const mid = Math.floor(payloadBuf.length / 2);

        const chunk1 = payloadBuf.subarray(0, mid);
        const chunk2 = payloadBuf.subarray(mid);

        // Send packet 1
        const header1 = Buffer.alloc(12);
        batchId.copy(header1, 0);
        header1.writeUInt16BE(0, 8);
        header1.writeUInt16BE(2, 10);
        const pkt1 = Buffer.concat([header1, chunk1]);

        // Send packet 2
        const header2 = Buffer.alloc(12);
        batchId.copy(header2, 0);
        header2.writeUInt16BE(1, 8);
        header2.writeUInt16BE(2, 10);
        const pkt2 = Buffer.concat([header2, chunk2]);

        await new Promise<void>((resolve, reject) => {
            socket.send(pkt1, 0, pkt1.length, 19998, '127.0.0.1', err => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise<void>((resolve, reject) => {
            socket.send(pkt2, 0, pkt2.length, 19998, '127.0.0.1', err => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise(r => setTimeout(r, 200));

        t.equal(entries.length, 1);
        t.equal(entries[0].msg, 'multi-packet test');

        socket.close();
        await testReceiver.stop();
    });

    t.test('ignores malformed packets', async t => {
        const testReceiver = new UdpReceiver({port: 19997, host: '127.0.0.1'});
        const entries: Record<string, unknown>[] = [];

        testReceiver.on('entry', (entry: Record<string, unknown>) => {
            entries.push(entry);
        });

        await testReceiver.start();

        const socket = dgram.createSocket('udp4');

        // Send packet that's too small
        const tinyPacket = Buffer.from([0x01, 0x02]);
        await new Promise<void>((resolve, reject) => {
            socket.send(tinyPacket, 0, tinyPacket.length, 19997, '127.0.0.1', err => {
                if (err) reject(err);
                else resolve();
            });
        });

        await new Promise(r => setTimeout(r, 200));
        t.equal(entries.length, 0);

        socket.close();
        await testReceiver.stop();
    });
});
