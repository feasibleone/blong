/**
 * resolveViewer — resolve the viewer for a commander leaf node.
 *
 * Priority:
 *  1. explicit `viewer` type on the descriptor level (registered viewers)
 *  2. model-system recognition — if the node maps to a registered
 *     `{subject}.{object}` model, the model-generated browse page component key
 *     is returned (the caller opens it as a portal tab) — see `resolveViewer`
 *  3. generic `json` fallback
 */
import {getViewer} from './registry.js';
import type {CommanderViewer} from './registry.js';

export interface ICommanderModelRef {
    subject: string;
    object: string;
}

/** Leaf meta carried by the source descriptor level. */
export interface ICommanderLeafMeta {
    /** Explicit viewer type (registered in the viewer registry). */
    viewer?: string;
    /** Model-system reference for recognition of `{subject}.{object}` resources. */
    model?: ICommanderModelRef;
}

export interface IResolvedViewer {
    /** A registered viewer component (for direct mount). */
    component?: CommanderViewer;
    /** A portal page-action component key (e.g. `component/party.person.browse`). */
    page?: string;
    /** Resolved type key ('model' when the model system owns it). */
    type: string;
}

/**
 * Resolve the viewer for a leaf node.
 * `models` should be the list of `{subject, object}` pairs declared by the
 * model system (e.g. from `subject.model.list` / the model aggregator).
 */
export function resolveViewer(
    meta: ICommanderLeafMeta | undefined,
    models?: ICommanderModelRef[],
): IResolvedViewer {
    if (meta?.viewer) {
        const component = getViewer(meta.viewer);
        if (component) return {component, type: meta.viewer};
    }
    if (meta?.model) {
        const {subject, object} = meta.model;
        const recognized = models?.some(m => m.subject === subject && m.object === object);
        if (recognized) {
            return {page: `component/${subject}.${object}.browse`, type: 'model'};
        }
    }
    return {component: getViewer('json'), type: 'json'};
}
