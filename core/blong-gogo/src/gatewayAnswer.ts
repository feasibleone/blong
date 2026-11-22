/**
 * The body of a JSON-RPC answer, built in one place (`@@D-956`).
 *
 * A JSON-RPC response carries exactly one of `result` and `error`, and the client's codec refuses a
 * body that carries neither — `jsonrpcEmpty`, "JSON RPC response without response and error". A
 * handler that answers nothing produced `result: undefined`, and `JSON.stringify` drops a key whose
 * value is `undefined`, so the reply arrived with no `result` at all and a caller saw a protocol
 * violation where the answer was simply empty.
 *
 * The same body is what the MLE codec seals, and there the defect was worse: `reply.serializeInput`
 * renders an absent value through the route's schema, and a permissive one (`type.Unknown()`) compiles
 * to an empty schema which fast-json-stringify fills with the four characters `undefined` — so the
 * sealed payload was not JSON, and a browser reported a `SyntaxError` instead of the missing answer.
 * Answering `null` fixes both shapes at once, because both of them read this one value.
 *
 * `null` rather than a typed error: an empty answer is an answer. A route whose handler forgot to
 * return anything is a contract the caller declared with its schema, and refusing it here would turn
 * every such route into a 500 for a mistake that the framework's validation is meant to catch.
 */

/** What a JSON-RPC answer carries: the id it answers, its result, and any progress it announced. */
export interface IAnswer {
    id?: unknown;
    result: unknown;
    progress?: unknown;
}

/**
 * The answer body: `result` is always present, `null` when the handler answered nothing.
 *
 * The id is passed through unchanged (it may legitimately be `null` on a parse failure), and
 * `progress` is added only when there is something to say — a key holding `undefined` is dropped by
 * `JSON.stringify`, so adding it unconditionally would change nothing but read as though it might.
 */
export const jsonRpcAnswer = ({id, result, progress}: IAnswer): Record<string, unknown> => ({
    jsonrpc: '2.0',
    id,
    result: result ?? null,
    ...(Array.isArray(progress) && progress.length > 0 ? {progress} : {}),
});
