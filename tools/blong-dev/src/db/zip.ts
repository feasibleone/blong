/**
 * A minimal ZIP writer — enough to store a database dump as one `.zip`.
 *
 * A backup has to be a single file an operator can copy off the host, and the
 * repository ships no archiver: the `zip` binary is not installed on the machines
 * `blong-dev` runs on, and adding an npm dependency to a dev tool for one archive
 * format is a supply-chain cost for a hundred lines of well-specified format.
 *
 * The writer emits one local file header per entry, the central directory and the
 * end-of-central-directory record, deflating with `node:zlib` (raw, no zlib
 * header) and falling back to `store` when deflating does not pay. Entries carry
 * the UTF-8 flag so a database name in a dump header survives the round trip.
 *
 * It is deliberately not a general-purpose archiver: no encryption, no data
 * descriptors, no ZIP64 (> 4 GiB), no directory entries. A dump that needs those
 * has outgrown `blong-dev db backup`, and that should fail loudly rather than
 * produce a file some unzip implementation reads as truncated.
 */
import {deflateRawSync} from 'node:zlib';

/** One file inside the archive, in the order it is written. */
export interface IZipEntry {
    /** Archive path, `/`-separated, no leading slash. */
    name: string;
    data: Buffer;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
/** "version made by" 2.0 on MS-DOS, "version needed" 2.0: deflate and UTF-8 names. */
const VERSION = 20;
const UTF8_FLAG = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** CRC-32 as the ZIP format defines it (IEEE 802.3, reflected, initial 0xffffffff). */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
        let value = index;
        for (let bit = 0; bit < 8; bit++) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
})();

/** The ZIP checksum of `data`. */
export function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed time and date, which is what the headers carry. */
function dosDateTime(when: Date): {time: number; date: number} {
    const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
    const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
    return {time, date};
}

interface IPreparedEntry {
    name: Buffer;
    method: number;
    crc: number;
    compressed: Buffer;
    size: number;
    offset: number;
    time: number;
    date: number;
}

/**
 * Deflate when that makes the entry smaller, store when it does not: a dump is
 * mostly text and compresses well, but an already-compressed blob (a screenshot
 * in `feedback.shot`) only grows.
 */
function compress(data: Buffer): {method: number; body: Buffer} {
    const deflated = deflateRawSync(data, {level: 9});
    return deflated.length < data.length
        ? {method: METHOD_DEFLATE, body: deflated}
        : {method: METHOD_STORE, body: data};
}

/** Write `entries` as a ZIP archive. */
export function createZip(entries: readonly IZipEntry[], when: Date = new Date()): Buffer {
    const {time, date} = dosDateTime(when);
    const prepared: IPreparedEntry[] = [];
    const localParts: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
        if (!entry.name || entry.name.startsWith('/') || entry.name.includes('..')) {
            throw new Error(`createZip: refusing an archive path '${entry.name}'`);
        }
        const {method, body} = compress(entry.data);
        const name = Buffer.from(entry.name, 'utf8');
        const crc = crc32(entry.data);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(LOCAL_HEADER, 0);
        header.writeUInt16LE(VERSION, 4);
        header.writeUInt16LE(UTF8_FLAG, 6);
        header.writeUInt16LE(method, 8);
        header.writeUInt16LE(time, 10);
        header.writeUInt16LE(date, 12);
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(body.length, 18);
        header.writeUInt32LE(entry.data.length, 22);
        header.writeUInt16LE(name.length, 26);
        header.writeUInt16LE(0, 28);
        prepared.push({
            name,
            method,
            crc,
            compressed: body,
            size: entry.data.length,
            offset,
            time,
            date,
        });
        localParts.push(header, name, body);
        offset += header.length + name.length + body.length;
    }
    const centralParts = prepared.map(entry => {
        const header = Buffer.alloc(46);
        header.writeUInt32LE(CENTRAL_HEADER, 0);
        header.writeUInt16LE(VERSION, 4);
        header.writeUInt16LE(VERSION, 6);
        header.writeUInt16LE(UTF8_FLAG, 8);
        header.writeUInt16LE(entry.method, 10);
        header.writeUInt16LE(entry.time, 12);
        header.writeUInt16LE(entry.date, 14);
        header.writeUInt32LE(entry.crc, 16);
        header.writeUInt32LE(entry.compressed.length, 20);
        header.writeUInt32LE(entry.size, 24);
        header.writeUInt16LE(entry.name.length, 28);
        // extra length, comment length, disk number, internal attrs, external attrs
        header.writeUInt16LE(0, 30);
        header.writeUInt16LE(0, 32);
        header.writeUInt16LE(0, 34);
        header.writeUInt16LE(0, 36);
        header.writeUInt32LE(0, 38);
        header.writeUInt32LE(entry.offset, 42);
        return Buffer.concat([header, entry.name]);
    });
    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    if (offset + centralSize > 0xffffffff - 22) {
        throw new Error('createZip: archive would exceed 4 GiB (ZIP64 is not supported)');
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(END_OF_CENTRAL, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(prepared.length, 8);
    end.writeUInt16LE(prepared.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...localParts, ...centralParts, end]);
}
