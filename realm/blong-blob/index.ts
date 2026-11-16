import {server} from '@feasibleone/blong';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {BLOB_TEST_COOKIE_SECRET, BLOB_TEST_CRYPTO_KEY} from './testConfig.ts';

/** Where an integration run keeps its store: a directory of its own, outside the repository. */
const DIRECTORY = join(tmpdir(), 'blong-blob-test');

/**
 * Which store this run exercises.
 *
 * `BLOB_BACKEND=s3` runs the same groups against an S3-compatible bucket — the dev MinIO — and nothing in
 * the tests changes, because both backends answer the one namespace (@@D-849). The filesystem is the
 * default: it needs no service, which is what a developer pressing *test* should get.
 */
const S3 = process.env['BLOB_BACKEND'] === 's3';

/** The bucket a run uses; `blong-integration` is the one the dev MinIO seeds. */
const STORE = S3
    ? {
          // The loader skips the port whose block is `false`, which is the whole backend choice.
          store: false,
          s3Store: {
              namespaces: {test: {}},
              // One suite's keys must not collide with another's in a shared bucket.
              prefix: 'blob-test',
              bucket: {Bucket: process.env['BLOB_BUCKET'] ?? 'blong-integration'},
              s3: {
                  region: process.env['BLOB_S3_REGION'] ?? 'us-east-1',
                  endpoint: process.env['BLOB_S3_ENDPOINT'] ?? 'http://localhost:9000',
                  credentials: {
                      accessKeyId: process.env['BLOB_S3_KEY'] ?? 'blong-admin',
                      secretAccessKey: process.env['BLOB_S3_SECRET'] ?? 'password',
                  },
                  forcePathStyle: true,
              },
          },
      }
    : {store: {directory: DIRECTORY, namespaces: {test: {}}}};

/**
 * index.ts — standalone server bootstrap for `blob` integration tests.
 *
 * Only the `blob` realm and the test runner are children. The framework realms it reuses — login,
 * core, access and blong — are loaded by the loader before any suite child. There is no `srv` here:
 * the realm keeps no database (@@D-837), so the only stateful thing a test needs is the store.
 *
 * RBAC is enforced on the gateway: the access realm resolves the caller's allowed actions, and a call
 * without one is answered 403.
 */
export default server(() => ({
    url: import.meta.url,
    children: [
        /** the `blob` realm */
        async function blob() {
            return import('./server.ts');
        },
        /** Server-hosted test runner (test intents only) */
        async function testRealm() {
            return import('@feasibleone/blong-test/server.ts');
        },
    ],
    config: {
        default: {
            // Enforce RBAC on the gateway — resolves allowed actions for the
            // authenticated user (access realm), 403 when not authorized. The upload route's stream
            // body is declared by the route (`@@D-860`), so nothing here has to ask for it.
            gateway: {authorize: 'access.authorization.list'},
        },
        dev: {
            core: {},
            access: {},
            blob: {},
            login: {},
            testRealm: {
                // Only this realm's server group may be started from the Test
                // runs console; the runner refuses every other method. Group 7
                // adds the groups this realm runs.
                testRun: {serverGroups: []},
            },
        },
        integration: {
            watch: {
                test: [
                    'test.storage',
                    'test.crypto',
                    'test.upload',
                    'test.read',
                    'test.scope',
                    'test.temp',
                    'test.variants',
                ],
            },
            blob: {
                ...STORE,
                // A test run needs a key and a cookie secret the handlers can compare against; a
                // deployment mounts both. The block of the port that serves `blob.*` is where the
                // realm's own settings sit (@@D-839 @@D-836).
                blobDispatch: {
                    crypto: {key: BLOB_TEST_CRYPTO_KEY},
                    cookie: {secret: BLOB_TEST_COOKIE_SECRET, ttl: 600},
                    // A run that commits a photograph must derive its thumbnail, which is what the
                    // library and the platform's prebuilt binary are here for (@@D-844).
                    variants: {enabled: true},
                },
            },
            testRealm: {
                testRun: {
                    serverGroups: ['test.storage', 'test.scope', 'test.temp', 'test.variants'],
                },
            },
        },
        // Playwright drives the UI; the server does not need to run every test
        // group on boot, and those runs share the store with the console.
        playwright: {
            watch: {test: []},
        },
        'test-ui': {
            testRealm: {
                testRun: {serverGroups: []},
            },
        },
    },
}));
