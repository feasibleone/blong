import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import type {FastifyInstance} from 'fastify';
import fp from 'fastify-plugin';
import {existsSync} from 'node:fs';
import path from 'path';

export type IConfig = {
    root: string;
};

export default fp<IConfig>(async function staticPlugin(fastify: FastifyInstance, config: IConfig) {
    await fastify.register(helmet, {
        contentSecurityPolicy: false, // Prevents helmet from wasting bytes on images/scripts/JSON
    });
    fastify.get('/favicon.ico', async (_request, reply) => {
        return reply.sendFile('favicon.ico', import.meta.dirname);
    });
    // A root that is not there is a suite deployed without a UI, which is ordinary: a realm-only
    // suite has no browser build, and a released process that refused to start over a missing
    // directory would be an API that broke for the sake of a page nobody asked it to serve. The
    // deploy convention puts the bundle inside the artifact at `browser/dist` (Phase 15 H), and the
    // mount it arrives under is a per-suite setting — so this check is what makes naming the path in
    // a release config safe to do *before* the pipeline that builds the bundle exists.
    const root = config.root ?? path.join(process.cwd(), 'dist');
    if (!existsSync(root)) {
        fastify.log.warn({root}, 'no browser build to serve: /s is not mounted');
        return;
    }
    fastify.register(fastifyStatic, {
        root,
        prefix: '/s',
        redirect: true,
        preCompressed: true,
        cacheControl: true,
        maxAge: '1y',
        immutable: true,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.header(
                    'Content-Security-Policy',
                    "default-src 'self';script-src 'self' 'unsafe-eval';style-src 'self' 'unsafe-inline'",
                );
            }
        },
    });
});
