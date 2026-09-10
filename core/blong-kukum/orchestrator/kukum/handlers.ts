import {handler} from '@feasibleone/blong';
import {PREDICATES} from '../../engine.ts';
import {methodName} from '../../operation.ts';
import {PRIMITIVES} from '../../primitives/index.ts';

/**
 * The kukum API surface, generated from the primitive catalogue.
 *
 * Every method is a one-line delegate to the `library()` function that
 * implements it — one per endpoint, beside this file. The file name is the
 * endpoint path with the `kukum` namespace dropped, which is also the name the
 * lib proxy registers: `kukum.source.get` is `sourceGet.ts`, and
 * `kukum.<primitive>.add` — one file serving all fourteen primitives — is
 * `add.ts`.
 *
 * `layerProxy` normalises every object key with `methodId` (lower-cased, dots
 * removed), which is exactly what the gateway sends for `/rpc/kukum/handler/add`
 * (`kukum.handler.add` → the same key). Adding a primitive to the catalogue
 * therefore adds five routes with no new files — the same record-driven pattern
 * as `srv`'s subject orchestrator and `blong-mock`.
 */

/**
 * A registered method name → the library function implementing it.
 *
 * `kukum` is the namespace, not part of the endpoint's path, so the library
 * drops it: `kukum.source.get` is implemented by `lib.sourceGet`.
 */
const libName = (method: string): string => {
    const rest = method.slice('kukum'.length);
    return rest.charAt(0).toLowerCase() + rest.slice(1);
};

/** The registered methods that are not per-primitive. */
const FIXED_METHODS = [
    'kukumPrimitiveFind',
    'kukumActivationFind',
    'kukumMethodFind',
    'kukumTreeFind',
    'kukumSourceGet',
    'kukumSourceCheck',
    'kukumInstructionFind',
] as const;

export default handler<object, Record<string, unknown>>(({lib}) => {
    const methods_ = {} as Record<string, unknown>;
    const api = lib as unknown as Record<string, (...params: unknown[]) => unknown>;

    // ── meta / cross-cutting ────────────────────────────────────────────────
    for (const name of FIXED_METHODS) {
        methods_[name] = function (params: unknown) {
            return api[libName(name)](params);
        };
    }

    // ── per-primitive management endpoints ──────────────────────────────────
    for (const primitive of PRIMITIVES) {
        for (const predicate of PREDICATES) {
            methods_[methodName(primitive.id, predicate)] = function (params: unknown) {
                // Called ON `api` on purpose: the binding reads the platform and
                // registry off `this`, so extracting it into a local and calling
                // it bare would leave `this` undefined. The library name is the
                // predicate alone — one library serves every primitive, so the
                // segment that differs (the primitive id) is skipped.
                return api[predicate](primitive.id, params);
            };
        }
    }

    return methods_;
});
