import browser from './browser.ts';
import server from './server.ts';

export default async (load): Promise<void> => {
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'test', 'test', ['microservice', 'integration', 'dev']),
        load(browser, 'test', 'test', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[1].test();
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
