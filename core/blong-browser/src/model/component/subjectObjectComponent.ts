import type {IComponent, IHandlerProxy, IModelSpec} from '@feasibleone/blong';
import {withDefaults} from '../defaults.js';
import {subjectObjectBrowse} from './subjectObjectBrowse.js';
import {subjectObjectNew} from './subjectObjectNew.js';
import {subjectObjectOpen} from './subjectObjectOpen.js';
import {subjectObjectReport} from './subjectObjectReport.js';

export default async (models: IModelSpec[], blong: IHandlerProxy<unknown>) => {
    const components: Record<string, () => Promise<IComponent>> = {};
    for (const rawModel of models) {
        const model = withDefaults(rawModel);
        const {subject, object} = model;
        components[`${subject}.${object}.browse`] = await subjectObjectBrowse(model, blong);
        components[`${subject}.${object}.new`] = await subjectObjectNew(model, blong);
        components[`${subject}.${object}.open`] = await subjectObjectOpen(model, blong);
        if (model.report?.permission) {
            // Default report — always registered when report permission is set
            components[`${subject}.${object}.report`] = await subjectObjectReport(model, blong);
            // Named reports — one component per entry in model.reports
            for (const reportId of Object.keys(model.reports)) {
                components[`${subject}.${object}.report.${reportId}`] = await subjectObjectReport(
                    model,
                    blong,
                    reportId,
                );
            }
        }
    }

    return components;
};
