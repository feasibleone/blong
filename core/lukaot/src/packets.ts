/**
 * The batch wire format a network sink sends and a collector reads.
 *
 * A batch is a JSON array of lines, split across UDP packets that each carry a 12-byte header: an
 * 8-byte random batch id, the packet's index, and how many packets the batch is. A collector
 * reassembles by id, so the order packets arrive in does not matter — which is the only property UDP
 * leaves a sender to work with.
 *
 * It lives beside the writer rather than in the viewer that reads it because the two must agree and
 * only one of them is a framework: the sink is `@feasibleone/lukaot/node`, and a viewer that guessed
 * the header could not be corrected by upgrading the process that sends (`@@D-930`).
 */

import {randomBytes} from 'node:crypto';
import type {Socket} from 'node:dgram';

/** Where a batch is sent, and how large one packet may be. */
export interface IBatchTarget {
    host: string;
    port: number;
    /** Largest packet to send, header included. */
    maxPacketSize: number;
}

/** 8 bytes of batch id, then `index` and `total` as big-endian uint16. */
export const HEADER_SIZE = 12;

/** A fresh batch id. */
export function createBatchId(): Buffer {
    return randomBytes(8);
}

/** The header one packet of a batch carries. */
export function createPacketHeader(batchId: Buffer, index: number, total: number): Buffer {
    const header = Buffer.alloc(HEADER_SIZE);
    batchId.copy(header, 0);
    header.writeUInt16BE(index, 8);
    header.writeUInt16BE(total, 10);
    return header;
}

/** The payload split into packets the target can carry. */
export function splitPayload(payload: Buffer, maxPayloadSize: number): Buffer[] {
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < payload.length; offset += maxPayloadSize)
        chunks.push(payload.subarray(offset, Math.min(offset + maxPayloadSize, payload.length)));
    return chunks;
}

/**
 * Send one batch, splitting it when it does not fit a packet.
 *
 * The send is fire-and-forget on purpose: a log destination must never make a caller wait, and a
 * dropped packet costs one line in a viewer rather than a request (`@@D-930`).
 */
export function sendBatch(socket: Socket, lines: readonly string[], target: IBatchTarget): void {
    if (lines.length === 0) return;
    const batchId = createBatchId();
    const payload = Buffer.from(JSON.stringify(lines));
    const chunks = splitPayload(payload, Math.max(target.maxPacketSize - HEADER_SIZE, 1));
    for (let index = 0; index < chunks.length; index += 1) {
        const packet = Buffer.concat([
            createPacketHeader(batchId, index, chunks.length),
            chunks[index]!,
        ]);
        socket.send(packet, 0, packet.length, target.port, target.host);
    }
}
