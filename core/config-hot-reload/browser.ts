import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    children: [
        async function testClient() {
            return import('@feasibleone/blong-test/browser.ts');
        },
        './configReload',
    ],
    config: {
        default: {
            remote: {
                canSkipSocket: true,
            },
        },
        dev: {
            configReload: {},
        },
        integration: {
            configReload: {},
            testClient: {
                backend: {
                    namespace: ['config'],
                },
            },
            watch: {
                test: ['test.config.get', 'test.config.theme.get'],
            },
        },
    },
}));
