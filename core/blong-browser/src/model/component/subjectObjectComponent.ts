import type {IAdapter, IComponent, IHandlerProxy, IModelSpec} from '@feasibleone/blong';
import {withDefaults} from '@feasibleone/blong-mock';
import type {IPortalConfig} from '../../index.js';
import {subjectObjectBrowse} from './subjectObjectBrowse.js';
import {subjectObjectNew} from './subjectObjectNew.js';
import {subjectObjectOpen} from './subjectObjectOpen.js';
import {subjectObjectReport} from './subjectObjectReport.js';

export default async function component(
    this: IAdapter<
        {
            portal?: IPortalConfig;
            context?: {
                menus?: Record<string, unknown[]>;
            };
        },
        object
    >,
    models: IModelSpec[],
    blong: IHandlerProxy<unknown>,
) {
    const components: Record<string, () => Promise<IComponent | IPortalConfig>> = {};
    this.config!.context ||= {menus: {}};
    this.config!.context.menus ||= {};
    for (const rawModel of models) {
        const model = withDefaults(rawModel);
        const {subject, object, subjectTitle} = model;
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
        this.config!.context.menus[`${subjectTitle}`] ||= [];
        this.config!.context.menus[`${subjectTitle}`].push(`${subject}.${object}.browse`);
    }

    components.portalConfigGet = async () => {
        return blong.lib.merge(
            {},
            {
                menu: Object.entries(this.config!.context?.menus || {}).map(([subject, items]) => ({
                    title: subject,
                    items,
                })),
                title: 'Blong',
                name: 'blong-portal',
            },
            this.config!.portal,
        );
    };

    return components;
}
