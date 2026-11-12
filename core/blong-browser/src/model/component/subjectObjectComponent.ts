import type {IAdapter, IComponent, IHandlerProxy, IModelSpec} from '@feasibleone/blong';
import {modelWarnings, withDefaults} from '@feasibleone/blong-mock';
import type {IPortalConfig} from '../../index.js';
import {mergePortalConfigs} from '../../portalConfig.js';
import {addMenuEntry, menuGroups, type IMenuNode} from '../menu.js';
import {subjectObjectBrowse} from './subjectObjectBrowse.js';
import {subjectObjectNew} from './subjectObjectNew.js';
import {subjectObjectOpen} from './subjectObjectOpen.js';
import {subjectObjectReport} from './subjectObjectReport.js';

/** The portal slice this aggregator reads: the portal config, read before it is composed. */
type ModelPortalConfig = Partial<IPortalConfig>;

export default async function component(
    this: IAdapter<
        {
            portal?: ModelPortalConfig;
            context?: {
                menus?: Record<string, IMenuNode[]>;
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
        const {subject, object} = model;
        // A model that promises something it does not state — a paged table with
        // no order, a navigator with nothing to list — is reported once, where the
        // pages are built, rather than discovered by whoever reads the screen.
        for (const warning of modelWarnings(model)) this.log?.warn?.(warning);
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
        // Where the page sits is the model's decision (`classifier`, `menu`), not
        // the aggregator's: twenty pages in one group overflow a menubar.
        addMenuEntry(this.config!.context.menus, model);
    }

    components.portalConfigGet = async () => {
        const portal: ModelPortalConfig = this.config!.portal ?? {};
        const generatedMenu = menuGroups(this.config!.context?.menus ?? {});
        // The suite's `ui.portal.portal.menu` adds groups to the menu the models
        // generate; it must not replace it. `merge` shallow-copies arrays, so a
        // suite that adds `Test` used to hide every model page. `menuMode:
        // 'replace'` is the explicit opt-out for a realm with a hand-written menu.
        const {menu} =
            portal.menuMode === 'replace'
                ? {menu: portal.menu}
                : mergePortalConfigs([{menu: generatedMenu}, portal]);
        return {
            ...portal,
            name: portal.name ?? 'blong-portal',
            title: portal.title ?? 'Blong',
            ...(menu ? {menu} : {}),
        };
    };

    return components;
}
