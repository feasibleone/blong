import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import type {FastifyInstance} from 'fastify';
import fp from 'fastify-plugin';
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
    fastify.register(fastifyStatic, {
        root: config.root ?? path.join(process.cwd(), 'dist'),
        prefix: '/s',
        redirect: true,
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
