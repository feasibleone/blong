import type {ICallLog, ILog} from '@feasibleone/blong/types';
import ky from 'ky';

export function methodId<T>(what: T): T {
    return (
        what &&
        ((typeof what === 'string'
            ? what.replace(/\./g, '').toLowerCase()
            : typeof what === 'object'
              ? Object.fromEntries(
                    Object.entries(what).map(([name, value]) => [methodId(name), value]),
                )
              : what) as T)
    );
}

export function methodParts(what: string): string {
    if (what.includes('.')) return what;
    if (!what.includes('$')) {
        // Existing behaviour: split the leading word group only.
        const lowercase = (match: string, word1: string, word2: string, letter: string): string =>
            `${word1}.${word2.toLowerCase()}${letter ? '.' + letter.toLowerCase() : ''}`;
        const capitalWords = /^([^A-Z]+)([A-Z][^A-Z]+)([A-Z])?/;
        return what.replace(capitalWords, lowercase);
    }
    // `$`-containing template names (e.g. the `$subject`/`$object` placeholders
    // in `core/blong-kopi`): split every camelCase word while keeping `$`
    // glued to the word it prefixes. A `$` followed by an uppercase letter
    // starts a new word, so `$subject$ObjectMerge` → `$subject.$object.merge`
    // (not `$subject$.object.merge`, which would break table/param lookups).
    const words: string[] = [];
    let current = '';
    for (let i = 0; i < what.length; i++) {
        const ch = what[i];
        const next = what[i + 1];
        if (ch === '$') {
            if (current && next && /[A-Z]/.test(next)) {
                words.push(current);
                current = '$';
            } else {
                current += '$';
            }
        } else if (/[A-Z]/.test(ch)) {
            const prev = current[current.length - 1];
            if (current && prev && (prev === '$' || /[A-Z]/.test(prev))) {
                current += ch; // continuation of a `$Word` or an acronym
            } else if (current) {
                words.push(current);
                current = ch;
            } else {
                current = ch;
            }
        } else {
            current += ch;
        }
    }
    if (current) words.push(current);
    return [words[0], ...words.slice(1).map(w => w.toLowerCase())].join('.');
}

export function snakeToCamel(string: string): string {
    return string.replace(/([-_]\w)/g, g => g[1].toUpperCase());
}

export function identifier(string: string): string {
    string = snakeToCamel(string);
    return /[^\w$]/.test(string) ? `'${string}'` : string;
}

export function camelToSentence(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .toLowerCase();
}

export interface IAnnotation {
    name: string;
    params: string[];
}

export function parseAnnotatedKey(key: string): {
    annotations: IAnnotation[];
    handlerName: string;
} {
    const tokens = key.trim().split(/\s+/);
    const handlerName = tokens.pop()!;
    if (!handlerName || handlerName.startsWith('@')) {
        throw new Error(
            `Malformed annotated key "${key}": the last token must be a non-empty handler name and must not start with "@".`,
        );
    }
    const annotations: IAnnotation[] = [];
    let current: IAnnotation | null = null;
    for (const token of tokens) {
        if (token.startsWith('@')) {
            current = {name: token.slice(1), params: []};
            annotations.push(current);
        } else if (current) {
            current.params.push(token);
        }
    }
    return {annotations, handlerName};
}

/**
 * A port's call channel, when it has one.
 *
 * A port is reachable as `unknown` from the places that want to record a call
 * through it (the handler proxy, the adapter's receipt), because a port is an
 * object the framework attaches handlers to rather than a type it owns. The cast
 * lives here so it stays in one place, and so a port whose logger is a third
 * party's — one without a call channel — simply records nothing instead of
 * throwing on the way through a dispatch.
 */
export function portLogCalls(port: unknown): ICallLog | undefined {
    return (port as {log?: ILog})?.log?.calls;
}

/**
 * The name a leg can hold: the wire name the call will actually reach.
 *
 * A handler-group call arrives as a path (`db/accessRoleEnsure`), and its two halves are
 * exactly what a leg is made of - the callee namespace and the method - so a separator
 * becomes a dot; a handler name arrives in camel case (`accessPermissionList`) and the wire
 * name it dispatches under is its dotted form (`access.permission.list`), which is what the
 * declaration has to carry: the callee half of a leg is read as the namespace the call was
 * aimed at, so a handler name there would name a participant that does not exist. Lookups
 * keep the original name: only the declaration is normalised, because the registry knows the
 * path and the leg grammar does not.
 */
export function legName(name: string): string {
    return methodParts(name).replace(/\//g, '.');
}

/**
 * Record the call itself, from inside the leg its caller declared.
 *
 * This is the framework's own tracing, not one of the log levels: a handler that
 * calls another method produces one start and one end record for the call, and an
 * error record if it throws. They are written *inside* the leg `declareCall`
 * bound, which is what makes them the call's evidence rather than a participant's,
 * and - because they go through the call channel - they are stored rather than
 * printed unless the process asked for them on stdout. Nothing is assembled at all
 * for a flow that opted out, which is what keeps a high-throughput flow from
 * paying for a picture of itself.
 */
export function recordedCall<T>(port: unknown, leg: string, fn: () => T): T {
    const calls = portLogCalls(port);
    if (!calls?.enabled()) return fn();
    calls.start(leg);
    try {
        const result = fn();
        if (result instanceof Promise) {
            return result.then(
                value => {
                    calls.end(leg);
                    return value;
                },
                error => {
                    calls.error(leg, error);
                    throw error;
                },
            ) as T;
        }
        calls.end(leg);
        return result;
    } catch (error) {
        calls.error(leg, error);
        throw error;
    }
}

/**
 * Returns true when an error type matches the `expect` declaration on `$meta`.
 *
 * Matching rules:
 *  - Exact string: `'foo.bar'` matches only `foo.bar`
 *  - Array of strings: any element that matches (exact or wildcard)
 *  - Wildcard prefix: `'foo.*'` matches any type starting with `foo.`
 */
export function isExpectedError(
    errorType: string | undefined,
    expect: string | string[] | undefined,
): boolean {
    if (!errorType || !expect) return false;
    const patterns = ([] as string[]).concat(expect);
    return patterns.some(pattern => {
        if (pattern.endsWith('.*')) {
            return errorType.startsWith(pattern.slice(0, -1));
        }
        return errorType === pattern;
    });
}

let loginCache: Promise<{protocol: string; hostname: string; port: number}> | null = null;
export async function loginService(
    discovery: (service: string) => Promise<{protocol: string; hostname: string; port: number}>,
): Promise<{protocol: string; hostname: string; port: number}> {
    if (!loginCache) loginCache = discovery('login');
    try {
        return await loginCache;
    } catch (error) {
        loginCache = null;
        throw error;
    }
}

export async function requestGet(
    url: string,
    errorHttp: (params: Record<string, unknown>) => unknown,
    errorEmpty: () => unknown,
    headers: Record<string, string | undefined> | undefined,
    protocol: string,
    tls: Record<string, unknown> | undefined,
): Promise<unknown> {
    const response = await ky.get(url, {
        ...tls,
        ...(headers && {
            headers: {
                'x-forwarded-proto': headers['x-forwarded-proto'] || protocol,
                'x-forwarded-host': headers['x-forwarded-host'] || headers.host,
            },
        }),
        throwHttpErrors: false,
    });

    const responseText = await response.text();
    let body: {[key: string]: unknown} | undefined;
    try {
        body = responseText ? JSON.parse(responseText) : undefined;
    } catch {
        body = undefined;
    }

    if (response.status < 200 || response.status >= 300) {
        throw errorHttp({
            statusCode: response.status,
            statusText: response.statusText,
            statusMessage: response.statusText,
            validation: body?.validation,
            debug: body?.debug,
            params: {
                code: response.status,
            },
            req: {
                url: response.url,
                method: 'GET',
            },
        });
    }

    if (body) return body;
    throw errorEmpty();
}

export async function requestPostForm(
    url: string,
    errorHttp: (params: Record<string, unknown>) => unknown,
    errorEmpty: () => unknown,
    headers: Record<string, string | undefined> | undefined,
    protocol: string,
    tls: Record<string, unknown> | undefined,
    form: Record<string, string | number | boolean | null | undefined> | URLSearchParams,
): Promise<string> {
    const forwardedHeaders = headers && {
        'x-forwarded-proto': headers['x-forwarded-proto'] || protocol,
        'x-forwarded-host': headers['x-forwarded-host'] || headers.host,
    };

    const body =
        form instanceof URLSearchParams
            ? form
            : new URLSearchParams(
                  Object.entries(form).map(([key, value]) => [
                      key,
                      value == null ? '' : String(value),
                  ]),
              );

    const response = await ky.post(url, {
        ...tls,
        headers: {
            ...(forwardedHeaders || {}),
            'content-type': 'application/x-www-form-urlencoded',
        },
        body,
        throwHttpErrors: false,
    });

    const responseText = await response.text();
    let responseJson: {[key: string]: unknown} | undefined;
    try {
        responseJson = responseText ? JSON.parse(responseText) : undefined;
    } catch {
        responseJson = undefined;
    }

    if (response.status < 200 || response.status >= 300) {
        throw errorHttp({
            statusCode: response.status,
            statusText: response.statusText,
            statusMessage: response.statusText,
            validation: responseJson?.validation,
            debug: responseJson?.debug,
            params: {
                code: response.status,
            },
            req: {
                url: response.url,
                method: 'POST',
            },
        });
    }

    if (responseText) return responseText;
    throw errorEmpty();
}
