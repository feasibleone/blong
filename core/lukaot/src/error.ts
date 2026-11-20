/**
 * The error signal: constructing it *is* throwing it and recording it.
 *
 * A call returns the object the gateway, the expected-error matcher and the completion handler
 * already understand — `type`, `message`, `print`, `params`, `statusCode`, `silent`, and a `cause`
 * underneath — and writes the record in the same movement, so a failure cannot be thrown without
 * being observed (`@@D-890`). The identifier is the `type`: two failures of one kind share one
 * identity however their wording moves.
 *
 * `silent` is control flow rather than a fault — a nested early exit — so a silent signal constructs
 * the value and records nothing unless an operator asks for its record by naming it in the policy.
 * That is the one thing policy may add: it silences a record, never the value, because the caller has
 * to throw something.
 */

import type {IErrorSignal, ISignal} from './declare.ts';
import {render, type IIdentity, type ISignalRecord} from './emit.ts';
import type {ISignalCallOptions, ISite} from './proxy.ts';
import type {SignalRegistry} from './registry.ts';

/** The failure a call hands back, in the shape the framework already reads. */
export interface ISignalError extends Error {
    /** The declared identifier. */
    type: string;
    /** The wording a person is shown, when the declaration gives one. */
    print?: string;
    /** The values the call supplied. */
    params?: unknown;
    /** The HTTP status a gateway answers with. */
    statusCode?: number;
    /** Control flow rather than a fault. */
    silent?: boolean;
    /** Field-level messages, when the failure is a validation one. */
    validation?: unknown;
    /** The failure underneath, carried rather than flattened. */
    cause?: Error;
    /**
     * The method the failure was thrown from, stamped by the runtime as it unwinds.
     *
     * Not part of the declaration: a declaration names *what went wrong*, and the method names
     * *where*. The framework writes it so a gateway can answer "which call" without reading a stack.
     */
    method?: string | string[];
    /** A transport or protocol code the caller may switch on. */
    code?: string;
    /** The request the failure answers, when a server put it there. */
    req?: {
        httpVersion: string;
        url: URL;
        method: string;
    };
    /** The response already started when the failure happened, if one had. */
    res?: {
        httpVersion: string;
        statusCode: number;
    };
}

/** What a caller may pass beside the values. */
export type IErrorCallOptions = ISignalCallOptions;

/** What the error emitter needs. */
export interface IErrorEmitterOptions {
    /** The declaration and the policy. */
    registry: SignalRegistry;
    /** Where the record goes. */
    write: (record: ISignalRecord) => void;
    /** The clock, for a test that pins the time. */
    now?: () => number;
    /** The ambient identity, read at construction. */
    identity?: () => IIdentity | undefined;
}

/** The frames of a stack, minus the noise the framework already prints. */
export function compactStack(error: Error): string | undefined {
    const frames = error.stack
        ?.split('\n')
        .slice(1, 3)
        .map(frame => frame.trim());
    return frames?.length ? frames.join('\n') : undefined;
}

/**
 * Build the emitter an error signal's call goes through.
 *
 * The record is written before the value is returned, so the order a reader sees — the line, then
 * the failure — is the order the process produced. A silent declaration writes nothing; a silent
 * declaration an operator has named in the policy writes at the level that policy set.
 */
export function createErrorEmitter(
    options: IErrorEmitterOptions,
): (
    signal: ISignal,
    params: unknown,
    site: ISite | undefined,
    call?: IErrorCallOptions,
) => ISignalError {
    const {registry, write, now = Date.now, identity} = options;
    return (signal: ISignal, params: unknown, site: ISite | undefined, call) => {
        const declared = signal as IErrorSignal;
        const policy = registry.policy(declared.id);
        const message = render(declared.message, params);
        const error: ISignalError = Object.assign(new Error(message), {
            type: declared.id,
            message,
            ...(declared.print === undefined ? {} : {print: render(declared.print, params)}),
            ...(params === undefined ? {} : {params}),
            ...(declared.statusCode === undefined ? {} : {statusCode: declared.statusCode}),
            ...(declared.silent ? {silent: true} : {}),
            ...(call?.cause === undefined ? {} : {cause: call.cause}),
        });
        const recorded = declared.silent !== true || registry.hasPolicy(declared.id);
        if (recorded) {
            const ambient = identity?.();
            write({
                signal: declared.id,
                kind: 'error',
                level: policy.level,
                message,
                ...(params === undefined ? {} : {params}),
                ...(site === undefined ? {} : {site}),
                ...(ambient === undefined ? {} : {identity: ambient}),
                time: now(),
            });
            registry.count(declared.id, 'emitted');
        }
        return error;
    };
}

/** Whether a error value is the one a given identifier declares. */
export function isSignalError(value: unknown): value is ISignalError {
    return (
        value instanceof Error &&
        typeof (value as ISignalError).type === 'string' &&
        'params' in (value as object)
    );
}
