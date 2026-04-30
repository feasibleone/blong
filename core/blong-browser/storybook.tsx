import type {IRegistry} from '@feasibleone/blong';
import load from '@feasibleone/blong-gogo';
import 'primeflex/primeflex.css';
import 'primeicons/primeicons.css';
import 'primereact/resources/primereact.min.css';
import 'primereact/resources/themes/vela-blue/theme.css';
import React from 'react';
import {App, Hint, type DispatchFn} from './src/index.ts';

// Ensure proper height propagation for fullscreen stories
const style = document.createElement('style');
style.textContent = `
    /* Fix Storybook iframe to fill available space */
    html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        font-family: 'Roboto';
        color: var(--text-color);
        background-color: var(--surface-0);
    }

    /* Make storybook-root fill the viewport for fullscreen layout */
    #storybook-root {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
    }

    /* Ensure stories with fullscreen layout fill the container */
    #storybook-root > * {
        flex: 1;
        min-height: 0;
    }
`;
document.head.appendChild(style);

export default browser =>
    function withBlong(Story: React.ComponentType) {
        let result: IRegistry | undefined;
        const [blong, setBlong] = React.useState<{
            registry: IRegistry | null;
            dispatch: DispatchFn | null;
        }>({registry: null, dispatch: null});
        React.useEffect(() => {
            load(
                browser,
                'ui-demo',
                {
                    browser: {
                        load: {
                            // logLevel: 'debug',
                        },
                        realm: {
                            // logLevel: 'debug',
                        },
                    },
                    apiSchema: false,
                    blongUi: {
                        portal: {
                            shouldRender: false,
                        },
                        mock: {},
                    },
                },
                ['storybook', 'integration', 'dev'],
            )
                .then(platform => platform.start({}))
                .then(registry => {
                    const adapter = registry.getPort('blongUi.portal');
                    setBlong({
                        registry,
                        dispatch: async (
                            method: string,
                            rpcParams: Record<string, unknown> = {},
                        ) => {
                            adapter?.log?.info?.(
                                {...rpcParams, $meta: {method}},
                                'Dispatching method',
                            );
                            const result = await adapter?.dispatch?.(rpcParams, {
                                method,
                                mtid: 'request',
                            });
                            return result[0];
                        },
                    });
                    result = registry;
                })
                .catch(err => {
                    console.error('Failed to load Blong platform:', err);
                });
            return () => {
                result?.stop();
            };
        }, []);

        return blong.dispatch ? (
            <App
                dispatch={blong.dispatch}
                schemaUrl="/schema.json"
                theme={{name: 'vela-blue', palette: 'dark-compact'}}
                loginRoute="/login"
            >
                <Story />
                <Hint />
            </App>
        ) : (
            <div>Loading Blong platform...</div>
        );
    };
