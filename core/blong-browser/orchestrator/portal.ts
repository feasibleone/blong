/**
 * orchestrator/portal.ts — built-in browser-side portal orchestrator.
 *
 * Dispatches portal.* calls to individual handlers in orchestrator/portal/.
 * Imports component handlers, portal configs, and action metadata from all
 * realm browser layers (matched by regex), plus the ui.portal handler group.
 */
import {orchestrator, type IHandlerProxy} from '@feasibleone/blong';
import component from '../src/model/component/subjectObjectComponent.ts';

export default orchestrator(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['portal', 'component', 'action'],
            imports: [/\.model$/, /\.component$/, /\.portal$/, /\.action?$/, 'ui.portal'],
        },
    },
    async createHandlers({
        handlers,
        layerApi,
        kind,
    }: {
        handlers: object;
        layerApi: IHandlerProxy<unknown>;
        kind: string;
    }) {
        if (kind === 'model') {
            const models = await Promise.all(Object.values(handlers).map(model => model()));
            return await component(models, layerApi);
        }
    },
}));
