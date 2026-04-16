import {handler} from '@feasibleone/blong';

export default handler(
    ({handler: proxy}) =>
        async function portalReady(params: Record<string, unknown>): Promise<boolean> {
            const [{default: React}, {default: ReactDOM}, {App}] = await Promise.all([
                import('react'),
                import('react-dom/client'),
                import('../../src/components/App/index.js'),
            ]);

            const rootEl =
                document.getElementById('root') ??
                (() => {
                    const el = document.createElement('div');
                    el.id = 'root';
                    document.body.appendChild(el);
                    return el;
                })();

            const dispatch = (method: string, rpcParams: Record<string, unknown> = {}) =>
                (proxy as unknown as Record<string, (p: unknown) => Promise<unknown>>)[method](
                    rpcParams ?? {},
                );

            const root = ReactDOM.createRoot(rootEl);
            root.render(React.createElement(App, {dispatch, ...params}));
            return true;
        },
);
