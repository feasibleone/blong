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
    const lowercase = (match: string, word1: string, word2: string, letter: string): string =>
        `${word1}.${word2.toLowerCase()}${letter ? '.' + letter.toLowerCase() : ''}`;
    const capitalWords = /^([^A-Z]+)([A-Z][^A-Z]+)([A-Z])?/;
    return what.replace(capitalWords, lowercase);
}

export function snakeToCamel(string: string): string {
    return string.replace(/([-_]\w)/g, g => g[1].toUpperCase());
}

export function identifier(string: string): string {
    string = snakeToCamel(string);
    return /[^\w$]/.test(string) ? `'${string}'` : string;
}

let loginCache: unknown;
export async function loginService(discovery) {
    if (!loginCache) loginCache = discovery('login');
    try {
        return await loginCache;
    } catch (error) {
        loginCache = false;
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
    let body: unknown;
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
            validation: (body as any)?.validation,
            debug: (body as any)?.debug,
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
    let responseJson: any;
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
