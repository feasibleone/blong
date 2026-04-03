import browser from './browser.ts';

type Load = (...params: unknown[]) => Promise<{
    start: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const platform = await load(browser, 'ui-demo', 'ui-demo', ['dev']);
    await platform.start();
    if (process.env.CI) await platform.stop();
};
