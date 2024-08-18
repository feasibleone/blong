import cors from '@fastify/cors';
import type {FastifyInstance, FastifyPluginOptions} from 'fastify';
import fp from 'fastify-plugin';

export default fp(async function corsPlugin(
    fastify: FastifyInstance,
    config: FastifyPluginOptions
) {
    await fastify.register(cors, config);
});
