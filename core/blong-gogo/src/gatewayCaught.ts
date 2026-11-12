/**
 * gatewayCaught.ts — the error a failed gateway call raises, whichever way it arrived.
 *
 * A dispatch answers a failure as a packet: `[error, $meta]`. Most callers unwrap it and rethrow the
 * first element, but one path rethrows the packet itself, and the gateway then read an array where it
 * expected an error — no `type`, no `statusCode`, so a refusal that declared 400 answered 500 with an
 * error object the client could only render as `{}` (`@@F-720`).
 *
 * The shape says what it is, so the unwrapping lives here rather than at every place that can answer
 * that way: a packet is an array whose first element is what the caller wanted.
 */
export const caughtError = (caught: unknown): unknown =>
    Array.isArray(caught) && caught.length ? caught[0] : caught;

export default caughtError;
