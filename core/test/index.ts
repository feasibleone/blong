import browser from './browser.js';
import server from './server.js';

export default async (load): Promise<void> => {
    const realms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'impl', 'impl', ['microservice', 'dev']),
        load(browser, 'impl', 'impl', ['integration', 'dev']),
    ]);
    for (const realm of realms) await realm.start();
    realms[1].test();
};
