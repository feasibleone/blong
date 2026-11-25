import {validation} from '@feasibleone/blong';

/**
 * `viewer.entry.watch` — the schema of a wake (`@@D-948`).
 *
 * `stream` is what makes this route a sequence instead of one result: the
 * handler is an async iterable, each value is one server-sent event, and
 * `$meta.abort` aborts when the reader goes away.
 *
 * A frame carries the records the buffer received after `after`, and the cursor to resume from
 * (`@@D-986`): `{entries, last, size}`. A caller that can afford a second call asks for
 * `details: false` and gets `{last, size}` — the wake this realm's own page listens to, where the
 * records come from `viewer.entry.find` and a frame is only ever a cursor.
 */
export default validation(
    async ({lib: {type}}) =>
        function viewerEntryWatch() {
            return {
                params: type.Object({
                    after: type.Optional(type.String()),
                    /** `false` sends the cursor and the size and no records. */
                    details: type.Optional(type.Boolean()),
                }),
                result: type.Object(
                    {
                        last: type.Optional(type.String()),
                        size: type.Number(),
                        /** What arrived since `after`; absent when the reader asked for the cursor. */
                        entries: type.Optional(type.Array(type.Unknown())),
                    },
                    {additionalProperties: true},
                ),
                // Sealed like every other stream (`@@D-949`): a frame says when
                // this process was busy, and a route that opted out for the sake of
                // `curl` would be the one path exercised least. The binary envelope
                // is what the page asks for.
                stream: true,
            };
        },
);
