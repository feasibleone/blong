import browser from './browser.ts';
import server from './server.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const manifest: Record<string, unknown> = {};
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(
            server,
            'handler-test-poc',
            'handler-test-poc',
            ['microservice', 'integration', 'dev'],
            manifest,
        ),
        load(
            browser,
            'handler-test-poc',
            'handler-test-poc',
            ['microservice', 'integration', 'dev'],
            manifest,
        ),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[1].test();
    const waitAfterTestEnv = process.env.WAIT_AFTER_TEST_MS;
    const waitAfterTestMs =
        waitAfterTestEnv != null && waitAfterTestEnv !== '' ? Number(waitAfterTestEnv) : 0;
    if (Number.isFinite(waitAfterTestMs) && waitAfterTestMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitAfterTestMs));
    }
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
