// import browser from './browser.js';
import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const realms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'eip', 'eip', ['microservice', 'integration', 'dev']),
        // load(browser, 'eip', 'eip', ['microservice', 'integration', 'dev']),
    ]);
    for (const realm of realms) await realm.start();
    await realms[0].test();
    // await realms[1].test();
};
