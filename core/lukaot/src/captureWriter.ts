/**
 * The callable surface a declaration of captures produces, and the reason it is a surface at all.
 *
 * A capture costs something even when nobody wants it: the payload has to be built before it can be
 * rendered, and a packet is usually the largest thing a hot path touches. So the *only* property this
 * module has to get right is that a disabled capture costs nothing — not a render, not a mask, not even
 * the object literal. That is what the shape of the surface buys:
 *
 * ```ts
 * this.capture?.http?.({method}, () => ({phase: 'request', method, url, headers, body}));
 * ```
 *
 * Three short-circuits, in increasing cost:
 *
 * 1. `capture` is absent when the port instance configured nothing — the optional chaining never
 *    evaluates its arguments.
 * 2. `capture.http` is absent when no declared capture has an `http` shape that this scope may take —
 *    same, per shape.
 * 3. The member exists but the policy refuses *this* selection: the member returns before invoking the
 *    thunk, so the payload closure is the entire cost.
 *
 * What remains is one closure per call site on an enabled path, which is the price of asking a question
 * the configuration answers.
 *
 * ## Why the family is the member name
 *
 * A handler writes `capture.http`, not `capture.httpExchangeRequest`, because a second declared capture
 * of the same shape would be a *configuration* difference — a different rung, a different scope — rather
 * than a different call site. So the member is the shape's family (`http.exchange` → `http`) and the
 * declarations of that family are tried in order until one is willing.
 */

import {
    applyMask,
    mergeMask,
    shapes as shipped,
    type CaptureFormat,
    type ICaptureShape,
    type IMask,
} from './capture.ts';
import type {ICapture} from './declare.ts';

/** What a call site knows about the capture it is taking. */
export interface ICaptureSelector {
    /** The operation — `$meta.method`, `db.subject.find`, `chat.postMessage`. */
    method?: string;
    /** Which half of a two-phase shape, when the capture is of one half. */
    phase?: string;
}

/** What the policy answered for one capture at one selection. */
export interface ICaptureResolution {
    /** The rung to render at. */
    level: string;
    /** Rules the scope added to this capture's own and its shape's floor. */
    mask?: IMask;
}

/** One written capture, which the host turns into a record. */
export interface ICaptureRecord {
    /** The declared identity. */
    id: string;
    /** The rendering shape's name. */
    shape: string;
    /** The rung it was rendered at. */
    level: string;
    /** The declared note, or the shape's own summary when the declaration gave none. */
    message: string;
    /** The small values, already masked. */
    fields?: Record<string, unknown>;
    /** The bulky part, already masked. */
    payload?: string;
    /** How big the payload was, whatever the rung kept. */
    bytes: number;
    /** How many values were withheld, so a reader knows something is missing rather than absent. */
    masked: number;
}

export interface ICaptureWriterOptions {
    /** The captures the layer declared, by identifier. */
    capture: Readonly<Record<string, ICapture>>;
    /**
     * Whether this capture is taken for this selection, and at which rung.
     *
     * `undefined` means no, and the payload is never built. The host decides what it can see — the
     * instance alias, the adapter type, the realm, the method — because those are its configuration's
     * vocabulary, not the emitter's.
     */
    resolve: (capture: ICapture, selector: ICaptureSelector) => ICaptureResolution | undefined;
    /** Where a rendered capture goes. */
    write: (record: ICaptureRecord) => void;
    /** The shapes to render with: the three lukaot ships, plus whatever a realm registered. */
    shapes?: Readonly<Record<string, ICaptureShape>>;
    /** How a rendering is written. `text` by default, because a terminal is what reads a dev line. */
    format?: CaptureFormat;
    /** The source of `sample` decisions, injectable so a test is deterministic. */
    random?: () => number;
}

/** The member a shape's captures are reached through: `http.exchange` → `http`. */
export function familyOf(shape: string): string {
    const [family] = shape.split('.');
    return family ?? shape;
}

/** One callable member: a selection, then the payload it would build. */
export type CaptureMember = (selector: ICaptureSelector, payload: () => unknown) => void;

/** The surface a declaration produces, keyed by shape family. */
export type CaptureSurface = Record<string, CaptureMember>;

/** Declarations grouped by shape family, keeping the declaration order. */
function groupByFamily(capture: Readonly<Record<string, ICapture>>): Map<string, ICapture[]> {
    const groups = new Map<string, ICapture[]>();
    for (const entry of Object.values(capture)) {
        const family = familyOf(entry.shape);
        const group = groups.get(family);
        if (group) group.push(entry);
        else groups.set(family, [entry]);
    }
    return groups;
}

/**
 * Build the surface.
 *
 * An empty declaration or a family with no resolvable capture yields no member at all, rather than a
 * member that does nothing: the call site is written with `?.` everywhere, and an absent member is what
 * makes that chaining skip the arguments.
 *
 * The surface does **not** judge a declaration's `enabled`: that judgement belongs to `resolve`, which
 * is the host that holds the configuration. Skipping here made the declaration the last word, so a
 * capture declared off could never be turned on by a process that asked for it — the operator's
 * `enabled: true` reached a member that had already returned, and nothing was recorded or said (@@F-770).
 */
export function createCaptureSurface(options: ICaptureWriterOptions): CaptureSurface {
    const {capture, resolve, write, format = 'text'} = options;
    const shapes = options.shapes ?? shipped;
    const random = options.random ?? Math.random;
    const surface: CaptureSurface = {};

    for (const [family, entries] of groupByFamily(capture)) {
        surface[family] = (selector, payload) => {
            for (const entry of entries) {
                const resolution = resolve(entry, selector);
                if (resolution === undefined) continue;
                if (entry.sample !== undefined && random() > entry.sample) continue;
                const shape = shapes[entry.shape];
                // A declaration naming a shape nobody registered is skipped rather than thrown: the
                // capture is an aid, and a realm that forgot to register its renderer must not take a
                // dispatch down.
                if (shape === undefined) continue;
                const level = resolution.level ?? entry.level ?? shape.levels[0] ?? 'line';
                const mask = mergeMask(shape.mask, mergeMask(entry.mask, resolution.mask));
                const rendered = shape.render(payload(), level, mask, format);
                write({
                    id: entry.id,
                    shape: entry.shape,
                    level,
                    message: entry.message ?? rendered.summary,
                    ...(rendered.fields === undefined ? {} : {fields: rendered.fields}),
                    ...(rendered.payload === undefined ? {} : {payload: rendered.payload}),
                    bytes: rendered.bytes,
                    masked: rendered.masked,
                });
                return;
            }
        };
    }
    return surface;
}

/** Re-exported for a host that wants to withhold one value itself — a single header, a single field. */
export {applyMask};
