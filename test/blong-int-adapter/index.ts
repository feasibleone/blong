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
    const platform = await load(server, 'int-adapter', 'int-adapter', ['integration']);
    await platform.start();
    await platform.test();
    if (process.env.CI) await platform.stop();
};
