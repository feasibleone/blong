import browser from './browser.ts';
import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'handler-test-poc', 'handler-test-poc', ['microservice', 'integration', 'dev']),
        load(browser, 'handler-test-poc', 'handler-test-poc', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[1].test();
    if (!process.env.CI) await new Promise(resolve => setTimeout(resolve, 2000));
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
