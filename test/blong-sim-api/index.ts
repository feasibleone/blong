import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

/**
 * Test runner for blong-sim-api suite.
 * Uses internal API testing (server-only).
 * The sim layer starts a mock OpenAPI server that the time adapter calls.
 */
export default async (load: Load): Promise<void> => {
    const platform = await load(server, 'sim-api', 'sim-api', [
        'microservice',
        'integration',
        'dev',
    ]);
    await platform.start();
    await platform.test();
    if (process.env.CI) await platform.stop();
};
