---
name: blong-test-int
description:
    Provision and use real backend services in Kubernetes for Blong integration tests. Covers the
    test/integration/ kustomization.yaml structure, k3d cluster setup in CI, the ci-test Rush bulk
    command, wait.sh pattern, and tap-wrapped index.test.ts. Use this skill only when the user
    explicitly requests CI integration tests with real databases or services in a k3d cluster, or
    needs to wire Kubernetes manifests for a test backend.
---

# Integration Tests with Kubernetes Backends

## Overview

When you want tests to run against the real adapter and protocol rather than a simulation or mock,
and the backend service can be provisioned automatically, you can run it in a k3d cluster during CI.
This approach gives the highest confidence because it exercises the complete stack end-to-end.

## How it works

| Step            | What happens                                                                           |
| --------------- | -------------------------------------------------------------------------------------- |
| 1. Manifests    | `test/integration/` contains `kustomization.yaml` and resource manifests (e.g., MySQL) |
| 2. Cluster      | CI creates a k3d cluster and runs `kubectl apply -k test/integration/`                 |
| 3. Rush command | `ci-test` bulk command runs each package's `ci-test` script                            |
| 4. Wait & run   | Script waits for the deployment to be ready, then runs `blong-dev test`                |
| 5. Activation   | The realm's test layer activates only under the `integration` config                   |

### Details

1. A `test/integration/` folder at the repository root contains a `kustomization.yaml` and
   Kubernetes resource manifests that provision the test backend (e.g., a MySQL deployment)
2. In CI, the GitHub Actions `integration` job creates a k3d cluster and deploys the services via
   `kubectl apply -k test/integration/`
3. The Rush `ci-test` bulk command runs each package's `ci-test` script
4. Each package's `ci-test` script can wait for the Kubernetes deployment to become ready, then runs
   the tests using `blong-dev test` or other means.
5. The realm activates the test layer only under the `integration` config activation

## File structure

```
<repo-root>/
└── test/
    └── integration/            # Kubernetes resources for test back ends
        ├── kustomization.yaml  # Kustomize entry point
        ├── deployment.yaml     # Back end service, namespace, PVC, ConfigMap, etc.
        └── wait.sh             # Wait for deployments ready, then run tests

<suite>/
├── package.json               # "ci-test": "../../test/integration/wait.sh && blong-dev test"
├── test.ts                    # tap-wrapped server-only test runner for CI
├── <realm>.test.ts            # runs the specific adapter tests, thin wrapper around test.ts
└── <realm>/
    ├── server.ts              # Realm with integration-activated test layer
    └── test/
        ├── testDispatch.ts    # Activated in integration mode
        └── test/
            └── testSubjectQuery.ts  # Test handler calling the adapter
```

Note that Blong allows all the integration tests to be run from a single entry point, but the reason
to have multiple `<realm>.test.ts` files is to run them in parallel and keep separate snapshots for
each adapter. It also allows to run them easily in isolation when troubleshooting a specific
adapter.

## Realm configuration

Activate the test layer only under the `integration` config to avoid running it in other
environments:

```typescript
// realm/server.ts
config: {
    default: {},
    microservice: {adapter: true, orchestrator: true},
    integration: {adapter: true, orchestrator: true, test: true},
},
```

## package.json ci-test script

```json
{
    "scripts": {
        "ci-test": "../../test/integration/wait.sh && blong-dev test"
    }
}
```

## test.ts pattern

```typescript
import load from '@feasibleone/blong-gogo';
import tap from 'tap';

import server from './server.ts';

export default async function test(intents: string[] = [], config: string | object = 'suite-name') {
    const platform = await load(server, 'suite-name', config, ['integration'].concat(intents));
    await platform.start({});
    await tap.test('blong suite-name', async test => {
        await platform.test(test);
    });
    await platform.stop();
}

if (import.meta.main) {
    test().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
```

## Complete example

A complete working example is in the [`core/blong-int-adapter`](../../../core/blong-int-adapter)
package.

## Choosing the right CI test approach

| Situation                                            | Use                                     |
| ---------------------------------------------------- | --------------------------------------- |
| Real backend can be provisioned in K8s automatically | **blong-test-int** (this skill)         |
| Backend too complex or costly to run in CI           | **blong-test-sim** (local sim server)   |
| Backend not needed at all for the tests              | **blong-mock-test** (mock orchestrator) |

## Related skills

- **blong-test** — Writing test handlers (steps, assertions, parallel execution)
- **blong-test-api** — Setting up the `index.ts` test entry point
- **blong-test-sim** — Simulating HTTP or TCP backends locally
- **blong-mock-test** — Replacing adapters with mock handlers
