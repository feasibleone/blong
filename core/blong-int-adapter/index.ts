import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

/**
 * Test runner for blong-int-adapter suite.
 * Uses internal API testing (server-only).
 * The adapter to test is selected via BLONG_ENV (e.g. adapter.mysql).
 */
export default async (load: Load): Promise<void> => {
    const adapterEnv = process.env.BLONG_ENV ?? 'adapter.mysql';
    const platform = await load(server, 'int-adapter', 'int-adapter', [adapterEnv]);
    await platform.start();
    await platform.test();
    if (process.env.CI) await platform.stop();
};
