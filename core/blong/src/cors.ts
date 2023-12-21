import cors from '@fastify/cors';
import fp from 'fastify-plugin';

export default fp(
    async function corsPlugin(fastify, config) {
        await fastify.register(cors, config);
    }
);
