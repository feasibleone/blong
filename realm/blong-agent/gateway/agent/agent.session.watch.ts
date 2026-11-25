import {validation} from '@feasibleone/blong';

/**
 * `agent.session.watch` — a session's tail, then its live events (`T-793`).
 *
 * `stream` is what makes the route a sequence: the handler answers an async iterable, each value is
 * one encoded frame, and `$meta.abort` aborts when the reader goes away (`@@D-948`). Every frame is
 * sealed, because the route says nothing about encryption and the default applies (`@@D-949`) — a
 * session's transcript is what the UI exists to show and what the connection protects.
 *
 * Nothing here declares the frame's type: it is the route's own shape, and a schema that pins it
 * would refuse the field a later release adds to a frame — the one failure a viewer must not have.
 */
export default validation(
    async ({lib: {type}}) =>
        function agentSessionWatch() {
            return {
                params: type.Object({
                    sessionId: type.String({maxLength: 64}),
                    /** Partition messages to read before going live; the adapter's default when absent. */
                    tail: type.Optional(type.Number()),
                    /** False sends `{partition, offset, size}` and no events. */
                    details: type.Optional(type.Boolean()),
                    /** Where the reader got to, as `<partition>:<offset>`. */
                    after: type.Optional(type.String()),
                }),
                result: type.Object({}, {additionalProperties: true}),
                stream: true,
            };
        },
);
