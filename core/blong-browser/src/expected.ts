/**
 * `$meta.expect` — the browser's half of the expected-errors feature.
 *
 * A test that probes a refusal on purpose declares the type it expects, and the
 * framework demotes the log entry at every boundary it crosses: the adapters and
 * the gateway read `$meta.expect` server-side (see
 * `docs/blong/docs/concepts/expected-errors.md`). The browser is the last
 * boundary and was the one left out: `wrapHandlerProxy` logged every failed call
 * at `error` level and raised the global dialog whatever the caller had
 * declared, so a deliberate 403 in a UI flow reached the CI report as
 * `[browser] error: [blong] … failed` beside the refusals nobody asked for
 * (@@D-695).
 *
 * The matching rules are the server's `isExpectedError` (`blong-gogo/src/lib.ts`)
 * restated: exact type, any element of an array, and a trailing `.*` prefix
 * wildcard. They are duplicated rather than imported because `blong-gogo` is the
 * runtime and never a dependency of browser code.
 */

/** The declaration a caller puts on `$meta`: one type, or several. */
export type ExpectedError = string | string[] | undefined;

/**
 * Returns true when `errorType` matches the `expect` declaration.
 *
 * - `'foo.bar'` — only `foo.bar`
 * - `['foo.bar', 'foo.baz']` — either
 * - `'foo.*'` — any type starting with `foo.`
 */
export function isExpectedError(errorType: string | undefined, expect: ExpectedError): boolean {
    if (!errorType || !expect) return false;
    const patterns = ([] as string[]).concat(expect);
    return patterns.some(pattern =>
        pattern.endsWith('.*') ? errorType.startsWith(pattern.slice(0, -1)) : errorType === pattern,
    );
}
