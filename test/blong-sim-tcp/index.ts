import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

/**
 * Test runner for blong-sim-tcp suite.
 * Uses internal API testing (server-only) since HSM operations are server-side.
 */
export default async (load: Load): Promise<void> => {
    const platform = await load(server, 'sim-tcp', 'sim-tcp', [
        'microservice',
        'integration',
        'dev',
    ]);
    await platform.start();
    await platform.test();
    if (process.env.CI) await platform.stop();
};
