import {validation} from '@feasibleone/blong';

/**
 * `viewer.entry.watch` — the schema of a wake (`@@D-948`).
 *
 * `stream` is what makes this route a sequence instead of one result: the
 * handler is an async iterable, each value is one server-sent event, and
 * `$meta.abort` aborts when the reader goes away.
 *
 * The result is one frame and never a record: `{last, size}` says where to read
 * from and how much the buffer holds. What a frame may carry is the ceiling a
 * stream lives under — it is protected by the connection and the caller's
 * capability, not by the per-response envelope — so the record stays on
 * `viewer.entry.find`.
 */
export default validation(
    async ({lib: {type}}) =>
        function viewerEntryWatch() {
            return {
                params: type.Object({after: type.Optional(type.String())}),
                result: type.Object({
                    last: type.Optional(type.String()),
                    size: type.Number(),
                }),
                // Sealed like every other stream (`@@D-949`): a frame says when
                // this process was busy, and a route that opted out for the sake of
                // `curl` would be the one path exercised least. The binary envelope
                // is what the page asks for.
                stream: true,
            };
        },
);
