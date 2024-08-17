import browser from './browser.js';
import server from './server.js';

export default async (load): Promise<void> => {
    const realms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'impl', 'impl', ['microservice', 'dev', 'integration']),
        load(browser, 'impl', 'impl', ['microservice', 'dev', 'integration']),
    ]);
    for (const realm of realms) await realm.start();
    realms[1].test();
};
