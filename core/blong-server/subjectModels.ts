/**
 * The model specs the shared subject port collected, keyed by the handler name it derived for each
 * of them (`${subject}${Object}Model`).
 *
 * The store is a module rather than a slot on the port's config, because a config is a
 * per-module snapshot: the validation that generates the CRUD schemas read `config.context` and
 * found nothing, while the port had already collected thirteen models into it (F-437). A module
 * is one instance per process, whatever imports it, so what the port writes is what the
 * validation reads — and `subjectModelList` answers from the same place, so the two can no longer
 * disagree.
 *
 * One instance per process is the point, and it holds for the deployed suite too: the artifact
 * loads the package's own sources, so both importers resolve to the same file.
 */
import type {IModelSpec} from '@feasibleone/blong';

const models: Record<string, IModelSpec> = {};

/** The models collected so far, keyed by the handler name each of them is answered under. */
export const subjectModelFind = (): Record<string, IModelSpec> => models;

/**
 * Record a model the port collected, under the handler name it derived for it.
 *
 * The port derives the name from the spec itself (`${subject}${Object}Model`, its first letter
 * capitalised, `$` placeholders included), which is the name the registry resolves the model
 * handler by — so the key is what a caller would ask for, not something this module invents.
 */
export const subjectModelAdd = (handlerName: string, model: IModelSpec): void => {
    models[handlerName] = model;
};
