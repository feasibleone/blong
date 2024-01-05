import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';

export default fp<{version: string}>(
    async function swaggerPlugin(fastify: FastifyInstance, {version}: FastifyPluginOptions) {
        await fastify.register(swagger, {
            openapi: {
                info: {
                    title: 'api',
                    version
                },
                components: {
                    securitySchemes: {
                        'ut-login': {
                            flows: {
                                authorizationCode: {
                                    authorizationUrl: '/rpc/login/form',
                                    scopes: {
                                        api: 'Public API'
                                    },
                                    tokenUrl: '/rpc/login/token'
                                }
                            },
                            type: 'oauth2'
                        }
                    }
                }
            }
        });
        await fastify.register(swaggerUi, {
            initOAuth: {
                usePkceWithAuthorizationCodeGrant: true,
                scopes: ['api'],
                clientId: 'demo'
            }
        });
    }
);
