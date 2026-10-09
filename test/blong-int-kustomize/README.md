# @feasibleone/blong-int-kustomize

The kustomize deployment realm's end-to-end runbook, and the assertions that go with it.

The realm generates a tree; a cluster is what says whether the tree is right. That work used to be
two shell scripts inside the realm and then two TypeScript entry points beside it — it lives here
now, with the other integration packages, because what it needs is a machine and a cluster rather
than the realm's own code.

## The runbook

One CLI, three commands, and the steps behind them are handlers in `orchestrator/runbook/`:

| Command           | What it does                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `machine prepare` | everything outside the cluster — the cluster, the suite's bundle, the framework image, the file server and both artifacts |
| `suite deploy`    | generate both trees, install the operator, apply, wait, and assert what the cluster ended up with                         |
| `cycle run`       | the developer's cycle: prepare the machine, then deploy through it                                                        |

```bash
node --conditions=development bin/blongIntKustomize.ts suite deploy --cluster=dev-cluster
```

The runbook builds nothing and fetches nothing: its image and its artifacts come from the
environment or a flag (`FRAMEWORK_IMAGE`, `ARTIFACT_URL`, `OPERATOR_ARTIFACT_URL`, `CLUSTER`,
`NAMESPACE`, `SUITE_ENTRY`, `TREE`, `SERVICE_OFF`, `REFRESH`), which is what lets one program serve
CI, a release and a developer's machine. It never creates a cluster it did not find — a run pointed
at one that is not there stops and says so, and a caller that does want one says `CREATE_CLUSTER=1`
(F-446).

`lib/` is the part a realm could host: one function per question, each taking its coordinates and a
`{run, capture, log}`, which is the handler shape. `lib/rules.ts` holds the decisions a shell script
wrote as `grep` and `[[ ]]` — a migration Job's arguments, whether an answer carries private key
material, whether a gateway refused a payload — and it is the only part of the runbook that a test
can hold without a cluster.

The developer's cycle:

```bash
CLUSTER=dev-cluster node k3d-dev-cycle.ts
```

## The assertions

`server/test/test/` runs the runbook's checks as tap steps, so a deployed suite is reported where
every other test is. They read a cluster rather than creating one, and they are gated — a run
without `BLONG_TEST_CLUSTER=1` skips every step that touches one:

```bash
BLONG_TEST_CLUSTER=1 SUITE_NAMESPACE=blong-suite blong-dev test
```

`SUITE_TREE` names the tree on disk for the steps that count services and credentials
(`system/kustomize` under a suite's package), and `SERVICE_OFF` matches a deployment that switched
one service off.
