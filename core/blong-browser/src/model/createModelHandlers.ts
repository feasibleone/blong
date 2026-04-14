/**
 * createModelHandlers — higher-order factory that generates Browse / New /
 * Open / Report component handlers from an array of ModelSpec definitions.
 *
 * Usage (marine/component/index.ts):
 *
 *   import {createModelHandlers} from '@feasibleone/blong-browser';
 *   import models from '../model/index.js';
 *   export default createModelHandlers(models);
 *
 * For each {subject, object} in the models array this factory registers:
 *
 *   {subject}.{object}.browse  →  <Explorer> list page
 *   {subject}.{object}.new     →  <Editor>   create page
 *   {subject}.{object}.open    →  <Editor>   edit page
 *   {subject}.{object}.report  →  <Report>   report page (if report config present)
 *
 * Each page component is created lazily: the schema is fetched from the server
 * (merged with the browser overlay) when the tab is first opened.
 *
 * Dropdowns are loaded on demand: when a DropdownWidget mounts it calls
 * dispatch('portal.dropdown.list', {names}) which routes to the portal
 * orchestrator.  The orchestrator caches the per-subject backend call so
 * all widgets on the same page share a single request.
 */
import type {IModelSpec} from '@feasibleone/blong';
import {componentHandler} from '@feasibleone/blong';
import {enrichSchema} from '../schema/registry.js';
import type {IEnrichedSchema} from '../types/widget.js';
import {withDefaults} from './defaults.js';
import {subjectObjectBrowse} from './entries/subjectObjectBrowse.js';
import {subjectObjectNew} from './entries/subjectObjectNew.js';
import {subjectObjectOpen} from './entries/subjectObjectOpen.js';
import {subjectObjectReport} from './entries/subjectObjectReport.js';
import {getObjectSchema} from './schemaFetcher.js';

/**
 * Creates a componentHandler that registers all pages for all provided models.
 *
 * The returned value is intended to be the default export of a realm's
 * component/index.ts file.
 */
export function createModelHandlers(models: IModelSpec[]) {
    return componentHandler(() => {
        const entries: Record<
            string,
            (params?: Record<string, unknown>) => Promise<{
                title: string;
                permission: string;
                icon?: string;
                params?: Record<string, unknown>;
                component: (params: Record<string, unknown>) => Promise<React.ComponentType>;
            }>
        > = {};

        for (const rawModel of models) {
            const model = withDefaults(rawModel);
            const {subject, object} = model;

            // ── Shared schema loader (result cached by schemaFetcher) ──────
            async function loadSchema(): Promise<IEnrichedSchema> {
                const raw = await getObjectSchema(
                    subject,
                    object,
                    model.schema as Record<string, unknown>,
                );
                return enrichSchema(
                    `${subject}.${object}`,
                    raw as import('../types/schema.js').IJsonSchema,
                );
            }

            entries[`${subject}.${object}.browse`] = subjectObjectBrowse(model, loadSchema);
            entries[`${subject}.${object}.new`] = subjectObjectNew(model, loadSchema);
            entries[`${subject}.${object}.open`] = subjectObjectOpen(model, loadSchema);
            if (model.report?.permission) {
                entries[`${subject}.${object}.report`] = subjectObjectReport(model, loadSchema);
            }
        }

        return entries;
    });
}
