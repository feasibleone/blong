import type {PrimitiveContext, PrimitiveDescriptor, PrimitiveFile} from '../engine.ts';
import adapter from './adapter.ts';
import component from './component.ts';
import error from './error.ts';
import gateway from './gateway.ts';
import handler from './handler.ts';
import layer from './layer.ts';
import model from './model.ts';
import orchestrator from './orchestrator.ts';
import realm from './realm.ts';
import schema from './schema.ts';
import seed from './seed.ts';
import storybook from './storybook.ts';
import suite from './suite.ts';
import test from './test.ts';

/**
 * The primitive catalogue.
 *
 * Every primitive is declarative data: a list of target paths plus the template
 * source for each. The API surface (`kukum.<primitive>.<predicate>`) is derived
 * from this list, and each descriptor names the skill that owns its prose, so
 * an agent can be pointed at the right guidance without the skill pasting file
 * recipes.
 *
 * One descriptor per file: a descriptor is data plus pure template functions, so
 * they stay plain modules rather than `library()` handlers, and a new primitive
 * is a new file plus one line here.
 */

/** The catalogue, in the order the API advertises it. */
export const PRIMITIVES: PrimitiveDescriptor[] = [
    realm,
    suite,
    layer,
    handler,
    orchestrator,
    adapter,
    error,
    schema,
    seed,
    model,
    test,
    gateway,
    component,
    storybook,
];

export const PRIMITIVE_IDS: string[] = PRIMITIVES.map(primitive => primitive.id);

export function getPrimitive(id: string): PrimitiveDescriptor | undefined {
    return PRIMITIVES.find(primitive => primitive.id === id);
}

/** Root-relative file list a primitive would produce, for `get`/`find` output. */
export function previewFiles(
    descriptor: PrimitiveDescriptor,
    ctx: PrimitiveContext,
): PrimitiveFile[] {
    return descriptor.files(ctx);
}
