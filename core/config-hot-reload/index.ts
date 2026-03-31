import server from './server.ts';

export default async (load): Promise<void> => {
    const platform = await load(server, 'config-hot-reload', 'config-hot-reload', [
        'microservice',
        'integration',
        'dev',
    ]);
    await platform.start();
    await platform.test();
    if (process.env.CI) await platform.stop();
};
