import type {IRegistry} from '@feasibleone/blong';
import load from '@feasibleone/blong-gogo';
import 'primeflex/primeflex.css';
import 'primeicons/primeicons.css';
import 'primereact/resources/primereact.min.css';
import 'primereact/resources/themes/vela-blue/theme.css';
import React from 'react';
import {Hint, useAppStore} from './src/index.ts';

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

export default (browser: Parameters<typeof load>[0]) =>
    // eslint-disable-next-line @eslint-react/component-hook-factories
    function WithBlong(Story: React.ComponentType) {
        const [App, setApp] = React.useState<React.ComponentType<{
            children?: React.ReactNode;
        }> | null>(null);
        React.useEffect(() => {
            useAppStore.getState().setToken('storybook-token');

            let result: IRegistry | undefined;
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
                    setApp(
                        () =>
                            registry.getPort('blongUi.portal')!.config.context
                                ?.container as React.ComponentType,
                    );
                })
                .catch(err => {
                    console.error('Failed to load Blong platform:', err);
                });
            return () => {
                result?.stop();
            };
        }, []);

        return App ? (
            <App>
                <Story />
                <Hint />
            </App>
        ) : (
            <div>Loading Blong platform...</div>
        );
    };
