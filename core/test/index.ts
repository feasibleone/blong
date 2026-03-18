import browser from './browser.ts';
import server from './server.ts';

export default async (load): Promise<void> => {
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'impl', 'impl', ['microservice', 'integration', 'dev']),
        load(browser, 'impl', 'impl', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    platforms[1].test();
};
