import {handler} from '@feasibleone/blong';
import type {JSX} from 'react/jsx-runtime';

export default handler<
    {shouldRender?: boolean},
    {container: (params: Record<string, unknown>) => JSX.Element}
>(
    ({handler: proxy, config: {shouldRender}}) =>
        async function ready(params, $meta) {
            const [{default: React}, {default: ReactDOM}, {App}] = await Promise.all([
                import('react'),
                import('react-dom/client'),
                import('../../src/components/App/App.js'),
            ]);

            const dispatch = (method: string, rpcParams: Record<string, unknown> = {}) =>
                (proxy as unknown as Record<string, (p: unknown) => Promise<unknown>>)[method](
                    rpcParams ?? {},
                );
            this.config.context ||= {};
            this.config.context.container = params =>
                React.createElement(App, {dispatch, ...params});
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
        },
);
