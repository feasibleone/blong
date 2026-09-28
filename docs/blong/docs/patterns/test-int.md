# Integration tests with real back ends

An adapter should be tested against the system it will meet. When that system cannot run in a
developer environment — Keycloak, Kafka, Vault, a cluster — it is provisioned for the test run
instead: `test/integration/` holds Kubernetes manifests, CI applies them to a temporary cluster, and
the suites that need them wait for the back ends to answer. The cluster exists only inside the run.

For when this level is the right one rather than a mock or a sim, see
[mock, sim or real](./mock-test.md#mock-sim-or-real).

## How it runs

The whole mechanism is switched on by one file existing. The shared CI workflow probes for
`test/integration/kustomization.yaml`; when it is there, the run creates a k3d cluster whose ports
are published to the runner, applies the manifests and runs the bulk test command:

```yaml
# .github/workflows/build.yaml — the package's ci-test does the rest
uses: infitx-org/actions/.github/workflows/rush.yaml@main
```

```text
kubectl apply -k test/integration/     # after the k3d cluster exists
rush ci-test --parallelism=2           # every package's ci-test script
```

A package opts in with its `ci-test` script, which is where the readiness gate belongs because only
the package knows which back ends it needs:

```json
{
    "scripts": {
        "ci-test": "../../test/integration/wait.sh mysql && blong-dev test"
    }
}
```

### The back ends and their ports

Each manifest publishes its service at a fixed `NodePort`, and the k3d cluster maps that node port
to the container port a developer or a runner would use, so the adapter configs can be ordinary
`localhost` configuration:

| Back end | Manifest                   | Container port | NodePort | k3d host map  | Image                            |
| -------- | -------------------------- | -------------- | -------- | ------------- | -------------------------------- |
| MySQL    | `mysql-deployment.yaml`    | 3306           | 30006    | `3306:30006`  | `mysql/mysql-server:8.0.32`      |
| MongoDB  | `mongodb-deployment.yaml`  | 27017          | 30017    | `27017:30017` | `mongo:6.0.5`                    |
| Keycloak | `keycloak-deployment.yaml` | 8180           | 30080    | `8180:30080`  | `quay.io/keycloak/keycloak:23.0` |
| MinIO    | `minio-deployment.yaml`    | 9000           | 30009    | `9000:30009`  | `minio` (pinned tag)             |
| Kafka    | `kafka-deployment.yaml`    | 9092           | 30092    | `9092:30092`  | `cp-kafka:7.6.0`                 |
| Vault    | `vault-deployment.yaml`    | 8200           | 30002    | `8200:30002`  | `hashicorp/vault:1.16`           |
| Redis    | `redis-deployment.yaml`    | 6379           | 30063    | `6379:30063`  | `redis:7-alpine`                 |

Keycloak, MinIO, Kafka, Vault and Redis also carry an init Job that seeds the realm, the bucket, the
topic, the secret and the keys the tests expect, so a suite starts against a known state rather than
against whatever the image ships.

### The wait gate

`wait.sh` is the reason a suite does not race the cluster it just created:

- With no arguments it waits for every Deployment in `blong-integration`; with arguments, only those
  (`wait.sh mysql`).
- A Deployment counts as ready when its `Available` condition is `True` — and MySQL gets a second
  gate, because `Available` only means the pod started, while the init SQL may still be running. The
  script therefore runs `mysqladmin ping` and `SELECT 1` before it lets the suite proceed.
- It polls every five seconds for up to 180 seconds, and on timeout it prints the Deployments and
  the last fifty log lines of each one that is not ready, then exits non-zero.

### What the `integration` intent changes

Two config blocks matter, and they are not the same block:

- **The `integration` intent** (`core/blong-gogo/src/load.ts`) sets `remote.canSkipSocket`, so a
  call that would use the RPC socket resolves against the local registry instead — which is what
  makes a `test.*` or `mock.*` call in-process; it turns on `gateway.debug` and
  `gateway.expectedErrors`; and it activates the layers listed in `core/blong-lib/layers.ts`
  (`adapter`, `orchestrator`, `gateway`, `sim`, `server/test`, …).
- **The `ci` block**, applied whenever the process runs on CI, is what makes a database connection
  resilient: `core/blong-server/adapter/db.ts` spreads its `knexResilience` settings (retries, pool
  lifetime) into that block, so a connection lost to a slow container start is retried rather than
  failing the run.

Connection resilience therefore belongs to the CI run, not to the intent: the same suite run locally
against a cluster gets the retry behaviour only if it is running as a CI process.

## Running it locally

Start a cluster and publish the same ports the workflow does — `k3d cluster create` with
`-p 3306:30006 -p 27017:30017 …` — then apply the manifests and run the waiting script yourself:

```bash
kubectl apply -k test/integration/
../../test/integration/wait.sh mysql
node mysql.test.ts
```

A suite's per-back-end entry points exist for exactly this: `test/blong-int-adapter/kafka.test.ts`
loads the suite with `['integration', 'adapter.kafka']`, which activates only that realm's adapter
and test layers, so one back end can be exercised without the other six.

## Adding a back end

1. Add `<name>-deployment.yaml` with a Deployment and a Service whose `nodePort` is unused in
   `test/integration/`.
2. List it in `test/integration/kustomization.yaml`.
3. Add the port mapping to the k3d cluster arguments in the shared
   `infitx-org/actions/.github/workflows/rush.yaml` —
   `-p <containerPort>:<nodePort>@agent:0:direct`. That file lives in the CI repository, so this is
   the one step that is not in this tree.
4. Point the adapter's config at `localhost:<containerPort>`, the way the existing ones do.
5. Add a `<name>.test.ts` entry point that passes `['adapter.<name>']` as the intent.
6. Make the package's `ci-test` wait for the new Deployment:
   `../../test/integration/wait.sh <name> && blong-dev test`.
7. If the tests need seeded state, add an init Job beside the Deployment, as the Keycloak, MinIO,
   Kafka, Vault and Redis manifests do.

## Reading a failure

The test step is allowed to fail so that diagnostics can still be collected; a separate step then
fails the job. On failure, `test/integration/ci-diagnostics.sh` writes `ci-debug/ci-diagnostics.txt`
and uploads it as an artifact, containing the cluster's recent events, a description of the MySQL
pod, `kubectl top pods`, the current and previous MySQL logs, and a connection-statistics dump. That
is what turns "the integration run failed" into a specific answer about which back end was unhealthy
before the suite started.

## What has a real back end

MySQL, MongoDB, Redis, Kafka, Keycloak, Vault and MinIO do, and the Kubernetes adapter uses the
runner's own cluster rather than a manifest. Slack and GitHub are manual — they need a token and a
real workspace — and the HTTP realm is an in-process echo server, not a cluster service. `webhook`,
`adapter.mle` and the TCP codecs have no CI back end, which is the honest limit of what this suite
claims.

## See also

- [Mock, sim or real](./mock-test.md) — choosing this level rather than a mock or a sim
- [Suite patterns](./suite.md) — the suite entry point that loads the `integration` intent
- `test/integration/` (manifests, `wait.sh`, `ci-diagnostics.sh`) and `test/blong-int-adapter/`
