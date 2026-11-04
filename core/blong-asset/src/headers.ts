import {createHash} from 'node:crypto';

/**
 * The headers a static server owes, and the one it is allowed to be wrong about.
 *
 * A bundle is HTML, JavaScript and CSS served to a browser, and the browser reads the two halves
 * differently. A **document** response sets the policies of the page it opens: the CSP, whether it
 * may be framed, where its referrers go, what the page may ask the device for, and whether it opens
 * an opener. A **subresource** response has none of those — the document it belongs to decides them
 * — and is read for what it says about *itself*: what type it is (`nosniff`), who may embed it
 * (`Cross-Origin-Resource-Policy`), whether a cross-origin reader is allowed (CORS), and how long a
 * cache may keep it. Sending the document set on every script is bytes no browser acts on, and it
 * makes a header list that reads as if each file were a page.
 *
 * `Strict-Transport-Security` is the exception that belongs to neither list: it is a policy of the
 * **host**, processed from any response that arrives over TLS, so it rides on every answer.
 *
 * CSRF is the one a static server cannot add to: it has no state to change, no cookie to bind and
 * no form to submit, so the document policy carries the two directives that matter for a bundle
 * (`form-action`, `base-uri`) and leaves the API's own protection where it belongs — with the API.
 *
 * The policy is built per response because one directive is about the transport
 * (`upgrade-insecure-requests` is wrong on a plain-HTTP port-forward), and because the inline hashes
 * are read from the build rather than configured.
 */
export interface ICspOptions {
    /** Turns the policy off for a bundle that serves content no policy can describe. */
    disabled?: boolean;
    /** Extra `script-src` hashes, in `'sha256-…'` form. */
    scriptHashes?: string[];
    /** Extra `style-src` hashes, in `'sha256-…'` form. */
    styleHashes?: string[];
    /** A directive map merged over the defaults; an empty array removes the directive. */
    directives?: Record<string, string | string[]>;
    reportUri?: string;
    /** Whether `upgrade-insecure-requests` rides the policy. Default: only over HTTPS. */
    upgradeInsecureRequests?: boolean;
}

/** The HSTS header, and the two numbers a browser reads it with. */
export interface IHstsOptions {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
}

export interface IHeaderOptions {
    csp?: ICspOptions;
    /** Header overrides, for a suite whose ingress or build needs one of them changed. */
    headers?: Record<string, string>;
    /** Origins a cross-origin reader may fetch the bundle from. Default: none. */
    corsOrigins?: string[];
    /** `false` turns HSTS off; it is only ever sent over HTTPS. */
    hsts?: IHstsOptions | false;
    referrerPolicy?: string;
    /** `DENY` by default; `SAMEORIGIN` is the one relaxation a framed UI needs. */
    frameOptions?: string;
}

/** What a response is, as far as the headers are concerned. */
export interface IHeaderContext {
    /** The response is the HTML shell, so its CSP is the strict one. */
    isHtml: boolean;
    /** The request arrived over TLS (directly or through a proxy that said so). */
    isHttps: boolean;
    /** The request's `Origin`, when it carried one. */
    origin?: string;
    /** Hashes of the inline scripts the shell carries. */
    inlineScriptHashes?: string[];
    /** Hashes of the inline styles the shell carries. */
    inlineStyleHashes?: string[];
}

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

/**
 * `'sha256-…'` for every inline script and style in a document.
 *
 * A build usually emits its JavaScript as files, so the strict policy is `'self'` and nothing else.
 * When a shell does carry an inline block — a boot script, a theme initialiser — the build cannot
 * know the hash it will have, so the server reads the document it is about to serve and names it.
 * The hash covers the block's text exactly as the browser sees it; whitespace inside the tag counts.
 */
export const collectInlineHashes = (
    html: string,
): {scriptHashes: string[]; styleHashes: string[]} => {
    const hash = (text: string): string =>
        `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
    const blocks = (tag: string): string[] => {
        const found: string[] = [];
        const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'gi');
        for (const match of html.matchAll(pattern)) {
            const attributes = match[1] ?? '';
            const body = match[2] ?? '';
            if (/\bsrc\s*=/i.test(attributes)) continue;
            if (body.trim() === '') continue;
            found.push(hash(body));
        }
        return found;
    };
    return {
        scriptHashes: unique(blocks('script')),
        styleHashes: unique(blocks('style')),
    };
};

/**
 * The Content-Security-Policy for a response.
 *
 * `style-src` keeps `'unsafe-inline'` and `script-src` keeps `'unsafe-eval'`, and both are
 * concessions the framework makes rather than habits: a component library writes inline `style`
 * attributes, which a policy without `'unsafe-inline'` blocks, and `core/blong-template` compiles
 * its templates with `new Function`, which a policy without `'unsafe-eval'` refuses — the dev
 * cluster's first page load failed there, with the framework's own `getCompiledFn` on the stack.
 * A bundle that has neither can remove each through `csp.directives`; scripts get no blanket
 * `'unsafe-inline'` either way.
 */
export const contentSecurityPolicy = (
    options: ICspOptions | undefined,
    context: Pick<IHeaderContext, 'isHttps' | 'inlineScriptHashes' | 'inlineStyleHashes'>,
): string | undefined => {
    if (options?.disabled) return undefined;
    const scriptHashes = unique([
        ...(options?.scriptHashes ?? []),
        ...(context.inlineScriptHashes ?? []),
    ]);
    const styleHashes = unique([
        ...(options?.styleHashes ?? []),
        ...(context.inlineStyleHashes ?? []),
    ]);
    const directives: Record<string, string[]> = {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'script-src': ["'self'", "'unsafe-eval'", ...scriptHashes],
        'style-src': ["'self'", "'unsafe-inline'", ...styleHashes],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'manifest-src': ["'self'"],
        'worker-src': ["'self'", 'blob:'],
        'media-src': ["'self'"],
    };
    const upgrade = options?.upgradeInsecureRequests ?? context.isHttps;
    if (upgrade) directives['upgrade-insecure-requests'] = [];
    if (options?.reportUri) directives['report-uri'] = [options.reportUri];
    for (const [name, value] of Object.entries(options?.directives ?? {})) {
        const values = Array.isArray(value) ? value : [value];
        // An empty value is how a caller removes a default: `frame-ancestors: []` is a UI that is
        // meant to be framed, and spelling that as an absent key would fall back to `'none'`.
        if (value === '' || values.length === 0) delete directives[name];
        else directives[name] = unique(values);
    }
    return Object.entries(directives)
        .map(([name, values]) => (values.length === 0 ? name : `${name} ${values.join(' ')}`))
        .join('; ');
};

/** The cross-origin headers a bundle's reader is allowed, and the silence when it is not. */
const corsHeaders = (
    origin: string | undefined,
    allowed: string[] | undefined,
): Record<string, string> => {
    if (!origin || !allowed?.length) return {};
    if (allowed.includes('*')) {
        return {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, HEAD, OPTIONS',
            'cross-origin-resource-policy': 'cross-origin',
        };
    }
    if (!allowed.includes(origin)) return {};
    return {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        vary: 'Origin',
        'cross-origin-resource-policy': 'cross-origin',
    };
};

/**
 * Every security header one response carries.
 *
 * Returned as a plain map so a caller can inspect it in a test, and so an override is one spread
 * rather than a decision inside the server's handler. The document policies are only in the map for
 * a document; every answer keeps the headers that are about the resource itself.
 */
export const securityHeaders = (
    options: IHeaderOptions | undefined,
    context: IHeaderContext,
): Record<string, string> => {
    const hsts =
        options?.hsts === false || !context.isHttps
            ? undefined
            : // One year is the shortest a browser will accept a preload entry for, and the value
              // every deployment of a public page ends up at; a suite can shorten it while it is
              // learning the shape of its own TLS.
              `max-age=${options?.hsts?.maxAge ?? 31536000}${
                  options?.hsts?.includeSubDomains === false ? '' : '; includeSubDomains'
              }${options?.hsts?.preload ? '; preload' : ''}`;
    // The policy is built only for a document: a subresource's CSP is ignored, and the work of
    // hashing the shell is wasted on a script.
    const csp = context.isHtml ? contentSecurityPolicy(options?.csp, context) : undefined;
    return {
        // About this response, whoever reads it: a script must not be sniffed into something else,
        // and it says who may embed it. These are the two a subresource is actually judged by.
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
        ...(hsts ? {'strict-transport-security': hsts} : {}),
        ...corsHeaders(context.origin, options?.corsOrigins),
        // A page's own policies. A browser ignores them on a subresource, so they ride only on the
        // shell — and a 404 is not a page, so it gets the resource set alone.
        ...(context.isHtml
            ? {
                  'x-frame-options': options?.frameOptions ?? 'DENY',
                  'x-permitted-cross-domain-policies': 'none',
                  'x-dns-prefetch-control': 'off',
                  'referrer-policy': options?.referrerPolicy ?? 'strict-origin-when-cross-origin',
                  'permissions-policy':
                      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), ' +
                      'magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
                  'cross-origin-opener-policy': 'same-origin',
                  ...(csp ? {'content-security-policy': csp} : {}),
              }
            : {}),
        // A caller's override is last, because it names a header this file chose and the reason to
        // override one is always local knowledge this file does not have.
        ...(options?.headers ?? {}),
    };
};
