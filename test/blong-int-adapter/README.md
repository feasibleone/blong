# @feasibleone/blong-int-adapter

Integration test suite for all `blong-gogo` adapter types.

Each adapter realm is **opt-in**: it only activates when its dedicated config name is passed via
`BLONG_ENV`. This prevents all adapters from requiring all backends simultaneously.

## Adapter Realms

| Realm       | Adapter Type                               | CI Backend                          | NodePort |
| ----------- | ------------------------------------------ | ----------------------------------- | -------- |
| `mysql/`    | `adapter.knex` (MySQL)                     | MySQL                               | 30006    |
| `mongodb/`  | `adapter.mongodb`                          | MongoDB                             | 30017    |
| `redis/`    | `adapter.redis`                            | Redis                               | 30063    |
| `http/`     | `adapter.http`                             | In-process Node.js echo server      | 30088    |
| `s3/`       | `adapter.s3`                               | MinIO                               | 30009    |
| `blob/`     | `adapter.blob` (the blob realm's S3 store) | MinIO                               | 30009    |
| `kafka/`    | `adapter.kafka`                            | Kafka KRaft                         | 30092    |
| `vault/`    | `adapter.vault`                            | Vault dev mode                      | 30002    |
| `keycloak/` | `adapter.keycloak`                         | Keycloak                            | 30080    |
| `k8s/`      | `adapter.k8s`                              | k3d cluster (kubeconfig default)    | —        |
| `slack/`    | `adapter.slack`                            | Manual only — requires Slack token  | —        |
| `github/`   | `adapter.github`                           | Manual only — requires GitHub token | —        |

## Running Tests

```bash
# Run a specific adapter (backend must be running)
node mysql.test.ts
node mongodb.test.ts
node redis.test.ts
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

The `testDispatch` orchestrator is **auto-provisioned** by the framework when a realm's `test/`
folder has no `testDispatch.ts` — no boilerplate needed.

## CI Backends

Backends are provisioned in `test/integration/`:

| Backend       | File                       | NodePort |
| ------------- | -------------------------- | -------- |
| MySQL         | `mysql-deployment.yaml`    | 30006    |
| MongoDB       | `mongodb-deployment.yaml`  | 30017    |
| Redis         | `redis-deployment.yaml`    | 30063    |
| Keycloak      | `keycloak-deployment.yaml` | 30080    |
| MinIO         | `minio-deployment.yaml`    | 30009    |
| Kafka (KRaft) | `kafka-deployment.yaml`    | 30092    |
| Vault (dev)   | `vault-deployment.yaml`    | 30002    |

K8s adapter tests use the k3d cluster already available in the GitHub Actions runner.

## Kafka coverage

The Kafka adapter is exercised at two levels, and each case belongs to the level that can actually
observe it. The **unit** file pins the mechanics exactly with a fake broker — a commit is the list
of offsets written to a fake consumer, a retry a count, a delivery report an event the test emits —
while the **integration** realm proves the same behaviour end to end against a live KRaft broker. A
case that needs a broker is never left to the fake, and a case the fake pins exactly is not made
slow and flaky just to prove it twice.

| Case                                                        | Unit — `core/blong-gogo/src/adapter/server/kafka.test.ts`                         | Integration — `kafka/test/test/`                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Concurrency: no more records in flight than it was given    | `a feed holds as many records in flight as its concurrency, and no more`          | `parallelConcurrency` — `concurrency: 3`, six records held   |
| Concurrency: one at a time keeps the order                  | `a feed commits a record only once it has been processed`                         | `waitForTheFeed` — offsets `[1, 2]` in produced order        |
| Commit by count                                             | the same test (`every: 1`)                                                        | every feed here (`{every: 1, ms: 100}`)                      |
| Commit by time                                              | `a feed commits on its timetable as well as on its count`                         | —                                                            |
| Commit on stop                                              | `a stopping feed commits what it processed, so a restart resumes after it`        | —                                                            |
| Commit refused, then offered again                          | `a commit the broker refuses is offered again rather than forgotten`              | —                                                            |
| Never commit past an unprocessed record                     | `a feed commits the contiguous prefix and never passes an outstanding record`     | `deadLetterIsNotRetried`                                     |
| Commit after a dead letter                                  | `a feed retries a record that throws and commits it only after the dead letter`   | `deadLetterIsNotRetried`                                     |
| Auto-commit and offset store off; group under the tenant    | `a feed never auto-commits, and joins its group under the tenant`                 | every feed runs in its own group                             |
| Retries: the attempt count is honoured                      | `…and commits it only after the dead letter` (exactly three)                      | `waitForTheFeed` (`attempts: 2`)                             |
| Retries: three by default                                   | `a feed with no dead letter retries the record and never commits past it`         | —                                                            |
| Retries: fails once, then accepted                          | `a record that fails once is retried, committed, and never dead-lettered`         | `retryThenSucceed`                                           |
| Retries: no dead letter means no end                        | the same test                                                                     | — (a record that never succeeds would block its partition)   |
| Dead letter: own bytes and `x-blong-*` headers              | `…and commits it only after the dead letter`                                      | `readDeadLetter`                                             |
| Dead letter: one that cannot be produced                    | `a dead letter that cannot be produced keeps the record outstanding`              | — (needs an undeclared topic, and blocks its partition)      |
| Produce/consume: each send answers its own report           | `each send answers its own delivery report while several are in flight`           | `concurrentMatching` — two stream calls in flight            |
| Produce/consume: a refused produce                          | `message.send fails when the broker refuses the message`                          | —                                                            |
| Produce routing: pattern → alias, `default`, one spec       | `a topic resolves to the first spec whose pattern names it, else to default`      | `listClients`, `resolveWorkTopic`, `resolveAnswerTopic`      |
| Produce routing: a real produce through the chosen producer | —                                                                                 | `answerIsProduced` — the answer reaches the answers topic    |
| Subscription glob expanded at start                         | —                                                                                 | `globIsExpanded` — one feed, `blong-int-adapter.feed.glob.*` |
| Client settings checked per kind                            | `a client setting outside its kind table is refused before it reaches librdkafka` | the config of every feed above                               |

Every topic this suite uses starts with `blong-int-adapter`, and the declarations live in
`kafka/meta/kafka/` — `integration.yaml` for the round-trip topic and `feed.yaml` for the feed
topics — so a broker that lost its volume gets all of them back from the realms that read them.

This table is the contract: a case added, renamed or dropped in either file is a row to change here.
Each test file opens with a comment pointing back at this section so the drift shows up in review.
