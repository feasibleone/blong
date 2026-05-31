/**
 * orchestrator/portal.ts — built-in browser-side portal orchestrator.
 *
 * Dispatches portal.* calls to individual handlers in orchestrator/portal/.
 * Imports component handlers, portal configs, and action metadata from all
 * realm browser layers (matched by regex), plus the ui.portal handler group.
 */
import {orchestrator, type IHandlerProxy} from '@feasibleone/blong';
import type {IPortalConfig} from '../src/index.ts';

export default orchestrator<{
    portal?: IPortalConfig;
    context?: {
        menus?: Record<string, unknown[]>;
    };
}>(() => ({
    extends: 'orchestrator.dispatch',
    activation: {
        default: {
            namespace: ['portal', 'component', 'action'],
            imports: [/\.model$/, /\.component$/, /\.portal$/, /\.action?$/],
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
        // Only build React components when running in a real browser environment.
        // In Node.js (blong-watch), JSX files cannot be parsed, so we skip this.
        if (kind === 'model' && globalThis.window) {
            const {default: component} = await import(
                '../src/model/component/subjectObjectComponent.ts'
            );
            const models = await Promise.all(Object.values(handlers).map(model => model()));
            return await component.apply(this, [models, layerApi]);
        }
    },
}));
