/**
 * `blong-dev call` — one call to a Blong gateway, answered on stdout.
 *
 * The proxy exists because curl needs a server to talk to; a single call does not, so this is the same
 * MLE session with the loop removed: resolve which gateway the method belongs to, merge the payload
 * it starts from with what the command line adds, send it, print the result (`@@D-801`).
 *
 * Recurring material lives in `.blong_callrc` — the address, the credentials, the defaults a method
 * never varies — and the command line carries only what is different:
 *
 * ```bash
 * blong-dev call chat.prompt.ask '{platform: slack, account: blong-bot, kind: text, text: Deploy?}'
 * blong-dev call chat.prompt.ask '{kind: text, text: Deploy?}' --payload.conversationId=C0ABCDEF
 * blong-dev call chatPromptAsk --payload.text='Deploy?' --dry-run
 * ```
 *
 * The payload is JSON or YAML (`{a: b}` needs no quoted keys), `--payload.<path>=<value>` sets or
 * overrides one property at a dotted path, `--dry-run` prints what would be sent, and a failing call
 * exits non-zero with the gateway's message.
 */
import {createMleSession} from '@feasibleone/blong-mle';

import {
    CALL_RC,
    credentialsOf,
    defaultPayload,
    loadCallRc,
    mergePayload,
    methodName,
    parsePayload,
    payloadFlag,
    plainOf,
    resolveServer,
    setPath,
    type ICallRc,
    type IServerEntry,
} from '../callRc.ts';
import {parseArgs} from './log.ts';

/** What the command is about to do, printed by `--dry-run`. */
export interface ICallPlan {
    method: string;
    server: string;
    url: string;
    /** The entry the url and credentials came from. */
    entry: IServerEntry;
    /** Which line of the file (or which fallback) named the server. */
    source: string;
    /** A `login.*` method: it travels on the handshake keys, unauthenticated. */
    public: boolean;
    /**
     * The params travel as JSON rather than MLE-encrypted, because the gateway serves this route
     * without auth and would not decode what it cannot authenticate (`@@F-710`).
     */
    plain: boolean;
    payload: Record<string, unknown>;
    /** `--dry-run`: print the plan instead of sending it. */
    dryRun: boolean;
}

/** Flags that take no value, so the argument after them is not theirs. */
const BOOLEAN_FLAGS = new Set(['dry-run', 'plain']);

/**
 * Rewrite a bare boolean flag as `--flag=true`, because the shared arg parser reads the token after a
 * bare flag as its value — `--dry-run '{a: b}'` would otherwise make the payload the flag's value and
 * leave the call without one.
 */
export function guardBooleans(args: string[]): string[] {
    return args.map(arg =>
        arg.startsWith('--') && BOOLEAN_FLAGS.has(arg.slice(2)) ? `${arg}=true` : arg,
    );
}

/** The call a command line describes, before anything is sent. */
export function planCall(args: string[], rc: ICallRc): ICallPlan {
    const parsed = parseArgs(guardBooleans(args));
    const [rawMethod, payloadText, ...rest] = parsed.positionals;
    if (!rawMethod) throw new Error('a method name is required (`blong-dev call <method> [payload]`)');
    if (rest.length) {
        throw new Error(
            `unexpected argument "${rest[0]}" — the payload is one argument: ` +
                `blong-dev call ${rawMethod} '{a: b}' --payload.c=1`,
        );
    }
    const method = methodName(rawMethod);

    const flagPayload: Record<string, unknown> = {};
    for (const [name, value] of parsed.options) {
        const flag = payloadFlag(name, value);
        if (flag) setPath(flagPayload, flag.path, flag.value);
    }

    const server = resolveServer(rc, {
        method,
        alias: parsed.options.get('server'),
        target: parsed.options.get('target'),
    });

    return {
        method,
        server: server.alias ?? '(target)',
        url: server.entry.url,
        entry: server.entry,
        source: server.source,
        public: method.startsWith('login.token.'),
        plain: parsed.options.get('plain') === 'true' || plainOf(rc, method),
        payload: mergePayload(defaultPayload(rc, method), parsePayload(payloadText), flagPayload),
        dryRun: parsed.options.get('dry-run') === 'true',
    };
}

/**
 * A thrown value as one line a reader can act on.
 *
 * A gateway answers a validation failure with an object rather than a sentence, and `Error.message`
 * of such an error is `[object Object]` — the one thing the caller cannot use. Text is kept as it is,
 * anything else is shown as JSON.
 */
export function messageOf(error: unknown): string {
    const value = (error as {message?: unknown})?.message ?? error;
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

/**
 * Send the call MLE-encrypted, which is what a route that requires auth expects.
 *
 * The session logs in when the file names credentials, and stays unauthenticated for a public route —
 * so a `login.*` method travels on the handshake keys, as the gateway requires.
 */
async function callEncrypted(
    plan: ICallPlan,
    credentials: {username?: string; password?: string},
): Promise<unknown> {
    const session = await createMleSession({url: plan.url, ...credentials});
    if (!plan.public) await session.ensureFresh();
    return session.call(plan.method, plan.payload, {public: plan.public});
}

/**
 * Send the call as plain JSON, for a route the gateway serves without auth.
 *
 * The gateway's MLE hook runs only on a route that requires auth, so an encrypted body on a public
 * route reaches the handler as an opaque string — the caller's params are there, but the handler
 * cannot see them (`@@F-710`). The session still logs in when it can, because a bearer token is what
 * a route-level authorization reads even where the params are in the clear.
 */
async function callPlain(
    plan: ICallPlan,
    credentials: {username?: string; password?: string},
): Promise<unknown> {
    const url = plan.url.replace(/\/+$/, '');
    const session = await createMleSession({url, ...credentials});
    const token = session.auth?.access_token;
    const response = await fetch(`${url}/rpc/${plan.method.replace(/\./g, '/')}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? {authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: plan.method,
            params: plan.payload,
        }),
    });
    const body = (await response.json()) as {result?: unknown; error?: unknown};
    if (body.error) throw new Error(messageOf(body.error));
    return body.result;
}

export async function call(args: string[]): Promise<void> {
    const {path, config} = loadCallRc() ?? {path: undefined, config: {}};
    let plan: ICallPlan;
    try {
        plan = planCall(args, config);
    } catch (error) {
        process.stderr.write(`blong-dev call: ${messageOf(error)}\n`);
        if (!path) {
            process.stderr.write(
                `blong-dev call: no ${CALL_RC} found above ${process.cwd()} — ` +
                    'write one with server.<alias>.url, or pass --target\n',
            );
        }
        process.exitCode = 1;
        return;
    }

    if (plan.dryRun) {
        process.stdout.write(
            `${JSON.stringify(
                {
                    method: plan.method,
                    server: plan.server,
                    url: plan.url,
                    source: plan.source,
                    plain: plan.plain,
                    config: path ?? null,
                    payload: plan.payload,
                },
                null,
                2,
            )}\n`,
        );
        return;
    }

    const credentials = credentialsOf(config, plan.entry);
    let result: unknown;
    try {
        result = plan.plain
            ? await callPlain(plan, credentials)
            : await callEncrypted(plan, credentials);
    } catch (error) {
        process.stderr.write(`blong-dev call ${plan.method} → ${plan.url}\n`);
        process.stderr.write(`blong-dev call: ${messageOf(error)}\n`);
        process.exitCode = 1;
        return;
    }
    process.stdout.write(`${JSON.stringify(result === undefined ? null : result, null, 2)}\n`);
}
