---
name: blong-test-int
description: Provision and use real backend services in Kubernetes for Blong integration tests. Covers the test/integration/ kustomization.yaml structure, k3d cluster setup in CI, the ci-integration Rush bulk command, wait.sh pattern, and tap-wrapped index.test.ts. Use this skill only when the user explicitly requests CI integration tests with real databases or services in a k3d cluster, asks how to configure the ci-integration script, or needs to wire Kubernetes manifests for a test backend.
---

# Integration Tests with Kubernetes Backends

## Overview

When you want tests to run against the real adapter and protocol rather than a simulation or mock,
and the backend service can be provisioned automatically, you can run it in a k3d cluster during CI.
This approach gives the highest confidence because it exercises the complete stack end-to-end.

## How it works

| Step | What happens |
|---|---|
| 1. Manifests | `test/integration/` contains `kustomization.yaml` and resource manifests (e.g., MySQL) |
| 2. Cluster | CI creates a k3d cluster and runs `kubectl apply -k test/integration/` |
| 3. Rush command | `ci-integration` bulk command runs each package's `ci-integration` script |
| 4. Wait & run | Script waits for the deployment to be ready, then runs `tap` against `index.test.ts` |
| 5. Activation | The realm's test layer activates only under the `integration` config |

### Details

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

## Coverage for integration tests

Because each adapter is exercised in a separate `tap` run, coverage files must be accumulated
across all runs and reported together. The pattern used in `core/blong-int-adapter`:

### coverage-map.mjs
```js
// Maps every test file to the adapter source files in the sibling blong-gogo package.
// tap resolves the globs relative to the package root, so use a relative path with `..`.
export default () => [
    '../blong-gogo/src/adapter/server/*.ts',
];
```

### integration-test.sh skeleton
```bash
#!/bin/bash
# Accumulate V8 coverage from each adapter run into .tap/coverage-all/
rm -rf .tap/coverage-all && mkdir -p .tap/coverage-all

run_adapter() {
    local name=$1
    local wait_arg="${WAIT_SERVICE[$name]:-}"
    [[ -n "$wait_arg" ]] && ../../test/integration/wait.sh "$wait_arg" || { echo "skipping $name"; return 1; }
    tap index.test.ts --allow-incomplete-coverage --coverage-map=./coverage-map.mjs \
        --coverage-report=none --test-arg="adapter.$name"
}

for adapter in "${ADAPTERS[@]}"; do
    run_adapter "$adapter"; RESULTS[$adapter]=$?
    cp .tap/coverage/*.json .tap/coverage-all/ 2>/dev/null || true
done

# Report: run c8 from the *parent* (core/) so sibling source paths resolve
C8=../../common/temp/node_modules/.pnpm/node_modules/.bin/c8
(cd .. && "$C8" report --temp-directory <pkg>/.tap/coverage-all \
    --include 'blong-gogo/src/adapter/server/*.ts' \
    --reporter text --reporter lcov -o <pkg>/coverage)
```

**Key constraints:**
- `tap report` cannot be used here — it hardcodes `cwd=projectRoot` and `tempDirectory=.tap/coverage`, with no CLI overrides
- `c8` must run from the parent directory (`core/`) so that source file paths from the sibling package resolve correctly under its `cwd`
- Use `-o <absolute-path>` (not `--reports-directory`) for the output directory

### CI artifact upload
Add to the `integration` job in the workflow so coverage survives to the `coverage` job:

```yaml
- name: Upload integration coverage
  if: always()
  uses: actions/upload-artifact@v5
  with:
    name: integration-coverage
    path: +(app|core|ext|library)/*/coverage/lcov.info
    if-no-files-found: ignore
```

## Related skills

- **blong-test** — Writing test handlers (steps, assertions, parallel execution)
- **blong-test-api** — Setting up the `index.ts` test entry point
- **blong-test-sim** — Simulating HTTP or TCP backends locally
- **blong-mock-test** — Replacing adapters with mock handlers
