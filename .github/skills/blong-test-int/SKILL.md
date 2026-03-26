---
name: blong-test-int
description: Provision and use real backend services in Kubernetes for Blong integration tests. Covers the test/integration/ kustomization.yaml structure, k3d cluster setup in CI, the ci-integration Rush bulk command, wait.sh pattern, and tap-wrapped index.test.ts. Use this skill whenever setting up CI integration tests that spin up a real database or service in a k3d cluster, configuring the ci-integration script, or wiring Kubernetes manifests for a test backend — even if the user just says 'run tests against a real database in CI'.
---

# Integration Tests with Kubernetes Backends

## Overview

When you want tests to run against the real adapter and protocol rather than a simulation or mock,
and the backend service can be provisioned automatically, you can run it in a k3d cluster during CI.
This approach gives the highest confidence because it exercises the complete stack end-to-end.

## How it works

1. A `test/integration/` folder at the repository root contains a `kustomization.yaml` and Kubernetes
   resource manifests that provision the test backend (e.g., a MySQL deployment)
2. In CI, the GitHub Actions `integration` job creates a k3d cluster and deploys the services via
   `kubectl apply -k test/integration/`
3. The Rush `ci-integration` bulk command runs each package's `ci-integration` script against the
   live Kubernetes backend
4. Each package's `ci-integration` script waits for the Kubernetes deployment to become ready, then
   runs the integration tests using `tap` directly against the `index.test.ts` file
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
├── package.json               # "ci-integration": "../../test/integration/wait.sh"
├── index.test.ts              # tap-wrapped server-only test runner for CI
└── <realm>/
    ├── server.ts              # Realm with integration-activated test layer
    └── test/
        ├── testDispatch.ts    # Activated in integration mode
        └── test/
            └── testSubjectQuery.ts  # Test handler calling the adapter
```

## Realm configuration

Activate the test layer only under the `integration` config to avoid running it in other environments:

```typescript
// realm/server.ts
config: {
    default: {},
    microservice: {adapter: true, orchestrator: true},
    integration: {adapter: true, orchestrator: true, test: true},
},
```

## package.json ci-integration script

```json
{
    "scripts": {
        "ci-integration": "../../test/integration/wait.sh && node --import tsx index.test.ts"
    }
}
```

## index.test.ts pattern

```typescript
import tap from 'tap';
import server from './server.ts';

tap.test('integration', async t => {
    const [platform] = await Promise.all([
        load(server, 'suite-name', 'suite-name', ['microservice', 'integration']),
    ]);
    await platform.start();
    await platform.test();
    await platform.stop();
});
```

## Complete example

A complete working example is in the [`core/blong-int-sql`](../../../core/blong-int-sql) package.

## Choosing the right CI test approach

| Situation | Use |
|---|---|
| Real backend can be provisioned in K8s automatically | **blong-test-int** (this skill) |
| Backend too complex or costly to run in CI | **blong-test-sim** (local sim server) |
| Backend not needed at all for the tests | **blong-mock-test** (mock orchestrator) |

## Related skills

- **blong-test** — Writing test handlers (steps, assertions, parallel execution)
- **blong-test-api** — Setting up the `index.ts` test entry point
- **blong-test-sim** — Simulating HTTP or TCP backends locally
- **blong-mock-test** — Replacing adapters with mock handlers
