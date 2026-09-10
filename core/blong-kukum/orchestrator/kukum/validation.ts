import {validation} from '@feasibleone/blong';
import {PREDICATES} from '../../engine.ts';
import {describePrimitives} from '../../operation.ts';

type GatewayValidation = () => {
    params: unknown;
    result: unknown;
    description: string;
    /** Kukum is local tooling that mutates source files, like `systemDebug`. */
    auth: false;
};

/**
 * Gateway routes for the kukum API, generated from the primitive catalogue.
 *
 * Registration is by the dotted triple the gateway resolves
 * (`kukum.handler.add` → `/rpc/kukum/handler/add`) and `Registry._validations()`
 * reads the name from each function, so a computed literal key is deliberate —
 * the same contract `blong-mock.validation(models)` relies on.
 */
export default validation(async ({lib: {type}}) => {
    const result: Record<string, GatewayValidation> = {};

    // `params` may be absent (a predicate with no arguments) but `result` must
    // always be a real schema — the gateway turns it into a fastify response
    // schema, and `undefined` crashes route registration.
    //
    // The name is set EXPLICITLY: `Registry._validations()` takes the method key
    // from the function's `.name`, and JavaScript's `SetFunctionName` only fires
    // for a function literal assigned directly to a property — not for a value
    // returned from a helper call (which would silently collapse every route
    // onto one empty key).
    const entry = (method: string, description: string): GatewayValidation => {
        const fn = () => ({
            params: type.Unknown(),
            result: type.Unknown(),
            description,
            auth: false as const,
        });
        Object.defineProperty(fn, 'name', {value: method});
        return fn;
    };

    for (const primitive of describePrimitives()) {
        for (const predicate of PREDICATES) {
            const method = `kukum.${primitive.id}.${predicate}`;
            result[method] = entry(method, `${predicate} ${primitive.id} — ${primitive.summary}`);
        }
    }

    result['kukum.primitive.find'] = entry('kukum.primitive.find', 'List the primitive catalogue');
    result['kukum.activation.find'] = entry(
        'kukum.activation.find',
        'Layer to intent activation table',
    );
    result['kukum.method.find'] = entry(
        'kukum.method.find',
        'Runtime-registered method groups, folders and files',
    );
    result['kukum.tree.find'] = entry(
        'kukum.tree.find',
        'Realm to group to file structure of the loaded graph',
    );
    result['kukum.source.get'] = entry(
        'kukum.source.get',
        'Read an artifact source and its instructions',
    );
    result['kukum.source.check'] = entry(
        'kukum.source.check',
        'Lint artifacts and report structured diagnostics',
    );
    result['kukum.instruction.find'] = entry(
        'kukum.instruction.find',
        'Artifacts carrying coding-agent instructions',
    );

    return result;
});
