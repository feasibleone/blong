import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const platform = await load(server, 'ui-demo', 'ui-demo', [
        'microservice',
        'integration',
        'dev',
    ]);
    await platform.start();
    await platform.test();
    if (process.env.CI) await platform.stop();
};
