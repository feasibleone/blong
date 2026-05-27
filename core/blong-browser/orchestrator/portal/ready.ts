import {handler} from '@feasibleone/blong';
import type {JSX} from 'react/jsx-runtime';
import type {IBlongPortalConfig} from '../../src/context/BlongContext.js';

export default handler<{shouldRender?: boolean; portal?: IBlongPortalConfig}, {container?: (params: object) => JSX.Element}>(
    (blong) => {
        const {config: {shouldRender}} = blong;
        return async function ready(params, _$meta) {
            const [{default: React}, {default: ReactDOM}, {App}] = await Promise.all([
                import('react'),
                import('react-dom/client'),
                import('../../src/components/App/App.js'),
            ]);

            this.config.context ||= {};
            this.config.context.container = params =>
                React.createElement(App, {handlerProxy: blong, log: this.log, ...params});
            if (shouldRender !== undefined && !shouldRender) return;
            const rootEl =
                document.getElementById('root') ??
                (() => {
                    const el = document.createElement('div');
                    el.id = 'root';
                    document.body.appendChild(el);
                    return el;
                })();
            const root = ReactDOM.createRoot(rootEl);
            root.render(this.config.context.container(params));
        };
    },
);
