# @feasibleone/blong-int-adapter

Integration test suite for all `blong-gogo` adapter types.

Each adapter realm is **opt-in**: it only activates when its dedicated config name is passed via `BLONG_ENV`. This prevents all adapters from requiring all backends simultaneously.

## Adapter Realms

| Realm | Adapter Type | CI Backend | NodePort |
|-------|-------------|-----------|---------|
| `mysql/` | `adapter.knex` (MySQL) | MySQL | 30006 |
| `mongodb/` | `adapter.mongodb` | MongoDB | 30017 |
| `http/` | `adapter.http` | In-process Node.js echo server | 30088 |
| `s3/` | `adapter.s3` | MinIO | 30009 |
| `kafka/` | `adapter.kafka` | Kafka KRaft | 30092 |
| `vault/` | `adapter.vault` | Vault dev mode | 30002 |
| `keycloak/` | `adapter.keycloak` | Keycloak | 30080 |
| `k8s/` | `adapter.k8s` | k3d cluster (kubeconfig default) | — |
| `slack/` | `adapter.slack` | Manual only — requires Slack token | — |
| `github/` | `adapter.github` | Manual only — requires GitHub token | — |

## Running Tests

```bash
# Run a specific adapter (backend must be running)
node mysql.test.ts
node mongodb.test.ts
node http.test.ts      # no backend needed, uses in-process echo server
node s3.test.ts
node kafka.test.ts
node vault.test.ts
node keycloak.test.ts
node k8s.test.ts
```

## Activation Model

Each realm's `server.ts` opts in under a dedicated config name:

```typescript
// mongodb/server.ts
config: {
  'adapter.mongodb': { adapter: true, test: true }
}
```

The `testDispatch` orchestrator is **auto-provisioned** by the framework when a realm's
`test/` folder has no `testDispatch.ts` — no boilerplate needed.

## CI Backends

Backends are provisioned in `test/integration/`:

| Backend | File | NodePort |
|---------|------|---------|
| MySQL | `mysql-deployment.yaml` | 30006 |
| MongoDB | `mongodb-deployment.yaml` | 30017 |
| Keycloak | `keycloak-deployment.yaml` | 30080 |
| MinIO | `minio-deployment.yaml` | 30009 |
| Kafka (KRaft) | `kafka-deployment.yaml` | 30092 |
| Vault (dev) | `vault-deployment.yaml` | 30002 |

K8s adapter tests use the k3d cluster already available in the GitHub Actions runner.
