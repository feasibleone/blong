import browser from './browser.ts';
import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: (config?: unknown) => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const manifest: Record<string, unknown> = {};
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'test', 'test', ['microservice', 'integration', 'dev'], manifest),
        load(browser, 'test', 'test', ['microservice', 'integration', 'dev'], manifest),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[1].test();
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
