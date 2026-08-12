import {server} from '@feasibleone/blong';

/**
 * blong-int-adapter: Integration tests for all blong-gogo adapter types.
 *
 * Each adapter realm is opt-in via a dedicated config name passed through
 * the BLONG_ENV environment variable (e.g. BLONG_ENV=adapter.mysql).
 * This prevents all realms from activating together and requiring all
 * backends simultaneously.
 */
export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: [
        './mysql',
        './mongodb',
        './redis',
        './http',
        './s3',
        './kafka',
        './vault',
        './keycloak',
        './k8s',
        './slack',
        './github',
    ],
    config: {
        default: {
            rpcServer: {port: 0},
            gateway: {port: 0},
        },
        microservice: {},
        'adapter.mysql': {
            mysql: {},
            watch: {
                test: [
                    'test.mysql.query',
                    'test.mysql.crud',
                    'test.mysql.schema',
                    'test.mysql.objectSchema',
                ],
            },
        },
        'adapter.mongodb': {
            mongodb: {},
            watch: {test: ['test.mongodb.documentInsert', 'test.mongodb.crud']},
        },
        'adapter.redis': {
            redis: {},
            watch: {test: ['test.redis.key', 'test.redis.hash', 'test.redis.script']},
        },
        'adapter.http': {
            http: {},
            watch: {test: ['test.http.echoGet']},
        },
        'adapter.s3': {
            s3: {},
            watch: {test: ['test.s3.objectPut', 'test.s3.objectCrud']},
        },
        'adapter.kafka': {
            kafka: {},
            watch: {test: ['test.kafka.messageProduce', 'test.kafka.messageRoundtrip']},
        },
        'adapter.vault': {
            vault: {},
            watch: {
                test: ['test.vault.secretPut', 'test.vault.secretCrud', 'test.vault.secretHealth'],
            },
        },
        'adapter.keycloak': {
            keycloak: {},
            watch: {
                test: [
                    'test.keycloak.realmFind',
                    'test.keycloak.realmCrud',
                    'test.keycloak.userCrud',
                    'test.keycloak.groupCrud',
                    'test.keycloak.roleCrud',
                    'test.keycloak.clientCrud',
                ],
            },
        },
        'adapter.k8s': {
            k8s: {},
            watch: {test: ['test.k8s.namespaceFind']},
        },
    },
}));
