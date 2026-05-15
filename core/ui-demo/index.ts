import load from '@feasibleone/blong-gogo';
import browser from './browser.ts';

type Load = typeof load;

const start = async (load: Load): Promise<void> => {
    const platform = await load(
        browser,
        'ui-demo',
        {
            browser: {
                load: {
                    logLevel: 'debug',
                },
                realm: {
                    logLevel: 'debug',
                },
            },
            apiSchema: false,
        },
        ['microservice', 'integration', 'dev'],
    );
    await platform.start({});
    // if (process.env.CI) await platform.stop();
};

start(load).catch(error => {
    console.error(error);
});
