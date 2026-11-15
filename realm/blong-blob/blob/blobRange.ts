/**
 * A `Range` header, resolved against the size of what is being served.
 *
 * A browser seeks in a video by asking for bytes, so a read route that ignores `Range` makes an mp4
 * impossible to seek. Only the single-range form is answered: a multi-range answer is a multipart
 * body, which nothing here produces, and a header that asks for one is served whole instead.
 */
export interface IBlobRange {
    start: number;
    end: number;
}

/** Parse `bytes=start-end`; `null` when the header is absent, malformed or asks for the whole file. */
export function blobRangeParse(header: string | undefined, size: number): IBlobRange | null {
    if (!header || !/^bytes=/.test(header)) return null;
    const spec = header.slice('bytes='.length).trim();
    if (spec.includes(',')) return null;
    const match = /^(\d*)-(\d*)$/.exec(spec);
    if (!match) return null;
    const [, from, to] = match;
    if (from === '' && to === '') return null;
    let start: number;
    let end: number;
    if (from === '') {
        // `bytes=-500` is the last 500 bytes.
        const length = Number(to);
        if (!Number.isFinite(length) || length <= 0) return null;
        start = Math.max(0, size - length);
        end = size - 1;
    } else {
        start = Number(from);
        end = to === '' ? size - 1 : Number(to);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start < 0 || start >= size || end < start) return null;
    return {start, end: Math.min(end, size - 1)};
}

/** The `Content-Range` a `206` carries. */
export function blobContentRange(range: IBlobRange, size: number): string {
    return `bytes ${range.start}-${range.end}/${size}`;
}
