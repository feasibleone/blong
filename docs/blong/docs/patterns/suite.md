# Suite

To define a suite follow the patterns below.

## Server

```ts
import {server} from '@feasibleone/blong';

export default server(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}), // this is not yet finalized
    children: [
        // import reusable realms
        async function reusableRealm1() {
            return import('reusable-realm-1/server.js');
        },
        async function reusableRealm2() {
            return import('reusable-realm-2/server.js');
        },
        // local custom realms
        './custom-realm-1',
        './custom-realm-2',
    ],
    config: {
        // suite configs per activation
        default: {},
        microservice: {},
        dev: {},
        integration: {
            watch: {
                test: ['test.subject'], // what to run during integration tests
            },
        },
    },
}));
```

## Browser

```ts
import {browser} from '@feasibleone/blong';

export default browser(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}), // this is not yet finalized
    children: [
        // import reusable realms
        async function reusableRealm1() {
            return import('reusable-realm-1/browser.js');
        },
        async function reusableRealm2() {
            return import('reusable-realm-2/browser.js');
        },
        // local custom realms
        './custom-realm-1',
        './custom-realm-2',
    ],
    config: {
        // suite configs per activation
        default: {},
        microservice: {},
        dev: {},
        integration: {
            watch: {
                test: ['test.subject'], // what to run during integration tests
            },
        },
    },
}));
```

## Well known reusable realms

Blong provides some reusable realms, that can be used in the suite or in other realms.
For example:

- `@feasibleone/blong-test` - helps with browser front end API testing,
  by providing a realm with the HTTP adapter
- `@feasibleone/blong-login` - helps with user authentication
- `@feasibleone/blong-openapi` - helps with implementing handlers for OpenAPI definitions

To use them, include them in the `children` property of the suite or realm, for example:

- `server.ts` - defines the suite and includes the reusable realms.

  ```ts
  import {server} from '@feasibleone/blong';

  export default server(blong => ({
      url: import.meta.url,
      children: [
          async function testServer() {
              return import('@feasibleone/blong-test/server.js');
          },
          async function login() {
              return import('@feasibleone/blong-login/server.js');
          },
          async function openapi() {
              return import('@feasibleone/blong-openapi/server.js');
          },
      ],
  }));
  ```

- `browser.ts` - defines the browser suite and includes the reusable realms.

  ```ts
  import {browser} from '@feasibleone/blong';

  export default browser(blong => ({
      url: import.meta.url,
      children: [
          async function testServer() {
              return import('@feasibleone/blong-test/browser.js');
          },
          async function login() {
              return import('@feasibleone/blong-login/browser.js');
          },
          async function openapi() {
              return import('@feasibleone/blong-openapi/browser.js');
          },
      ],
  }));
  ```

## Common concepts

Suites export a single function, which receives the Blong's `load` function as parameter and
initiates the loading of realms and optionally runs the tests. Suites are launched from the command line,
using the `blong` CLI tool in the suite's root folder. The `load` function has the following signature:

```ts
type Load = (
    definition: object,
    suiteName: string,
    parentConfig: string | object,
    activations: string[], // config activations to apply for the test
) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;
```

The parameters are:

- `definition`: The server or browser definition as factory function - this is the default export of the
  `server.ts`, `browser.ts` or other platform file in the suite's root folder
- `suiteName`: The name of the suite. The name has some impact on various entities:
  - It determines the name of the configuration file where additional
    config is stored. The name is: `.ut_<suite><env>rc`, where `<suite>` is the lowercase suite name and
    `<env>` is the environment, for example `dev` or `test`.
  - It determines the default k8s namespace where the suite is deployed.
- `parentConfig`: Configuration overrides for the suite. This parameter is used to avoid the need of
   additional configuration files for the cases of running automated tests.
- `activations`: Config activations to apply. This is used to activate the
  appropriate configurations within the realms to avoid the need to do this via configuration files
  or command line parameters.

## Tests

There can be different tests, depending on what part of the functionality
is tested and the specific [interaction](../concepts/interactions.md):

## API tests

These tests cover part of the most common interaction - **Application front ends**.
They simulate calls from the front end to the API gateway, without
running the UI. They are faster to run and easier to debug, but they do not test the UI.

To achieve this, the browser and server platforms are loaded and the tests are initiated
from the browser side. For the browser platform only the adapter, orchestrator and test
layers are activated. The browser platform is chosen, as it is the best
to simulate in automated tests due to these reasons:

- Fastest to run in node.js
- Closest to the most used interaction - application front running in a browser
- It uses the same components that are used in the real browser front end.

This is also the usual way to run the suite during development, as it allows
for the most frequent interactions to be developed and tested with low latency loop.
As such, it is often present in the `index.ts` file in the suite's root folder.

```ts
import browser from './browser.ts';
import server from './server.ts';

type Load = (
  definition: object,
  suiteName: string,
  parentConfig: string | object,
  activations: string[],
) => Promise<{
    start: () => Promise<unknown>;
    test: () => Promise<unknown>;
    stop: () => Promise<unknown>;
}>;

export default async (load: Load): Promise<void> => {
    const platforms: Awaited<ReturnType<typeof load>>[] = await Promise.all([
        load(server, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
        load(browser, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']),
    ]);
    for (const platform of platforms) await platform.start();
    await platforms[1].test(); // run tests from the browser side
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (process.env.CI) for (const platform of platforms) await platform.stop();
};
```

### Internal API tests

These tests simulate internal calls, usually to the orchestrators.
To achieve this, only the server platform is loaded and the tests are initiated
from the server side.

In this case, the test is wrapped in the `tap` testing framework, to provide
some test coverage report.

```ts
// internal.test.ts
import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const platform = await load(
    server,
    'suite-name',
    'suite-name',
    ['microservice', 'dev', 'test', 'integration']
);
await platform.start();
await tap.test('internal api', async test => {
    await platform.test(test);
});
await platform.stop();
```

### Integration tests with K8s test back ends

When testing adapters against a real back end that is unavailable in developer environments, the
back end can be provisioned automatically in a temporary Kubernetes cluster during CI.

**How it works:**

1. A `test/integration/` folder at the repository root contains a `kustomization.yaml` and Kubernetes
   resource manifests (Deployments, Services, ConfigMaps, PVCs) that provision the test back end.
2. In CI the GitHub Actions `integration` job creates a k3d cluster and deploys the services:

   ```
   kubectl apply -k test/integration/
   ```

3. The Rush `ci-integration` bulk command then runs each package's `ci-integration` npm script.
4. The `ci-integration` script is typically a `wait.sh` shell script that:
   - Waits for all deployments in the test namespace to become `Available`
   - Runs `tap index.test.ts --allow-incomplete-coverage`
   - Optionally captures back-end logs for debugging
5. `index.test.ts` is the tap-wrapped entry point that loads only the server platform with the
   `integration` activation and calls `platform.test(test)`.

**`test/integration/` folder structure:**

```
test/
└── integration/
    ├── kustomization.yaml     # Kustomize entry point
    ├── mysql-deployment.yaml  # Back end resources (Namespace, Deployment, Service, …)
    └── wait.sh                # Wait for readiness + run tap tests
```

**`test/integration/kustomization.yaml`:**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: blong-integration
resources:
  - mysql-deployment.yaml
```

**`test/integration/wait.sh`:**

```bash
#!/bin/bash

timeout=60
interval=1
elapsed=0

while [ $elapsed -lt $timeout ]; do
  if kubectl -n blong-integration get deployments \
      -o jsonpath='{.items[*].status.conditions[?(@.type=="Available")].status}' \
      | grep -q "False"; then
    echo "Waiting for all deployments to be ready..."
    sleep $interval
    elapsed=$((elapsed + interval))
  else
    break
  fi
done

tap index.test.ts --allow-incomplete-coverage
```

**`index.test.ts`** — tap entry point for the integration run:

```ts
import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

const platform = await load(server, 'suite-name', 'suite-name', ['microservice', 'integration', 'dev']);
await platform.start();
await tap.test('suite integration tests', async test => {
    await platform.test(test);
});
await platform.stop();
```

**`package.json`** — hooks the wait script into the Rush `ci-integration` command:

```json
{
    "scripts": {
        "ci-integration": "../../test/integration/wait.sh"
    }
}
```

**Realm configuration** — the test layer is only activated under `integration`:

```ts
config: {
    default: {},
    microservice: {adapter: true},
    integration: {test: true},
}
```

**Suite `server.ts`** — declare which test handlers to run via the `watch.test` list:

```ts
config: {
    integration: {
        watch: {
            test: ['test.realm.query'],
        },
    },
},
```

A complete working example is in the [blong-int-sql](https://github.com/feasibleone/blong/tree/main/core/blong-int-sql)
package.

## UI tests

These tests run the full browser app and simulate user interactions with the UI.
They are slower to run and harder to debug, but they test the UI as well.

This is not yet implemented, as the front end framework is not yet ready, but the idea is to
run the tests from the browser side, using a test runner like Playwright.

## Edge device tests

These tests simulate interactions from edge devices such as ATMs, POS terminals, or IoT devices.
They initiate requests at the TCP/binary protocol level rather than at the HTTP API level.

This is not yet documented. For protocol-level simulation patterns see the
[blong-sim-tcp](https://github.com/feasibleone/blong/tree/main/core/blong-sim-tcp) package and the `blong-codec` skill.
