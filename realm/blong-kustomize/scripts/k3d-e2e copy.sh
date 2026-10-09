#!/usr/bin/env bash
#
# k3d-e2e.sh — deploy a suite's generated kustomize tree to a local multi-node
# k3d cluster and check the result.
#
# The cluster is created only if it is missing. The suite artifact comes from
# `ARTIFACT_URL` (the GitHub release zip) or `ARTIFACT_PATH` (an unpacked tree or
# an `npm pack` output, for a run without egress); exactly one must be set. The
# framework image must already be pullable by the cluster — this script does not
# build one, because a build needs a container runtime the CI runner owns, not
# the cluster.
#
# Bringing an image in without docker (the k3d nodes here are podman containers,
# and `k3d image import` needs the docker API):
#
#   podman build -t <name>:<tag> .
#   podman tag localhost/<name>:<tag> docker.io/library/<name>:<tag>   # match the kubelet reference
#   podman save docker.io/library/<name>:<tag> -o /tmp/img.tar
#   for n in server agent; do
#       podman cp /tmp/img.tar "k3d-${CLUSTER}-${n}-0:/tmp/img.tar"
#       podman exec "k3d-${CLUSTER}-${n}-0" ctr -n k8s.io images import /tmp/img.tar
#   done
#
# Import into every node: a DaemonSet schedules one pod per node, and a kubelet
# pulls locally unless a registry is configured. A `file://` artifact URL also
# works when the artifact is staged on the node's hostPath, which is how the
# first end-to-end run was done without an HTTP endpoint.
#
# Two traps in that import, both of which make the cluster look freshly rolled
# while it runs old code. `podman save localhost/<name>:<tag>` writes that one
# reference, so the import lands beside the name the manifests use rather than
# replacing it — and `ctr images tag` refuses while the old name exists, so the
# old record has to go first:
#
#   podman exec $NODE ctr -n k8s.io images rm docker.io/library/<name>:<tag>
#   podman exec $NODE ctr -n k8s.io images tag localhost/<name>:<tag> docker.io/library/<name>:<tag>
#
# A build leaves its intermediate stage behind as a dangling image, so a few
# builds fill the store with tens of GB. They are the layer cache too, so keep the
# generation just built and drop the older ones by age, the way
# `k3d-dev-cycle.sh` does after its import loop. What made the accumulation
# expensive rather than routine was the size of the context: the
# `.dockerignore` at the repository root is what keeps it at a few hundred MB,
# and its patterns have to be deep (`**/node_modules`) because a pattern without
# a slash matches the context root only (F-379).
# Re-publishing an artifact into a cluster that is already running needs one more
# step: the operator caches what it fetched per suite and version, so a new zip
# under the same URL and version is not fetched again — the child keeps
# generating with the old code. Clear the cache inside the running operator pod
# before waiting for the next pass:
#
#   kubectl -n blong-system exec deploy/blong-operator -- \
#       sh -c 'rm -rf /cache/<suite> /cache/generations/<suite>*'
#
# Which of the two copies runs is the subtlety behind that step: the operator
# *runs* this realm from its own mount, but the tree it generates for a child is
# generated with the copy inside the artifact it fetched for that child's suite
# (`/cache/<suite>/<version>/realm/blong-kustomize`). A change to this realm
# therefore has to be published as *that* suite's artifact — a fresh
# `kustomize.zip` alone leaves the tenant's tree as it was.
#
# The operator needs an artifact of its own — it runs this realm, and it fetches
# what it runs the way every process does. The committed install tree names the
# GitHub release (`blong-kustomize.zip`), which a cluster without egress cannot
# reach, so a local run deploys the realm, zips it, serves it beside the suite's
# artifact and passes the URL as OPERATOR_ARTIFACT_URL:
#
#   rush deploy --scenario operator --target-folder /tmp/op --overwrite
#   # zip /tmp/op, copy it to the file server as kustomize.zip
#   OPERATOR_ARTIFACT_URL=http://<server>/kustomize.zip ARTIFACT_URL=… ./k3d-e2e.sh
#
# Usage:
#   ARTIFACT_PATH=/tmp/shop-suite ./k3d-e2e.sh
#   CLUSTER=blong-e2e NAMESPACE=shop-suite ARTIFACT_URL=https://…/suite.zip ./k3d-e2e.sh
#
set -euo pipefail

CLUSTER="${CLUSTER:-blong-e2e}"
NAMESPACE="${NAMESPACE:-blong-suite}"
SUITE_ENTRY="${SUITE_ENTRY:-./index.ts}"
TREE="${TREE:-system/kustomize}"
AGENTS="${AGENTS:-1}"
# A service the deployment decides to run itself (`SERVICE_OFF=mysql`). The same runbook, because the
# interesting half is not a tree generated without a service — the unit tests pin that — but a
# *switch*: the operator regenerates the tree from the CR, so a declaration that cannot carry it
# writes the workload back.

if [[ -z "${ARTIFACT_URL:-}" && -z "${ARTIFACT_PATH:-}" ]]; then
    echo "set ARTIFACT_URL (cluster) or ARTIFACT_PATH (local dev) to the suite artifact" >&2
    exit 2
fi

echo "== cluster ${CLUSTER} =="
if ! k3d cluster list "${CLUSTER}" >/dev/null 2>&1; then
    # Two nodes on purpose: a single-node cluster cannot show that the read-only
    # suite mount works across nodes, which is the point of the volume model.
    k3d cluster create "${CLUSTER}" --agents "${AGENTS}" --wait
else
    echo "already present"
fi

echo "== generate ${TREE} =="
rm -rf "${TREE}"
SERVICE_ARGS=()
if [[ -n "${SERVICE_OFF:-}" ]]; then
    SERVICE_ARGS+=("--kustomize.deploy.services.${SERVICE_OFF}=false")
    echo "the deployment runs ${SERVICE_OFF} itself"
fi
node --conditions=development "$(git rev-parse --show-toplevel)/core/blong-gogo/bin/blong.ts" \
    "$(cd "$(dirname "${SUITE_ENTRY}")" && pwd)/$(basename "${SUITE_ENTRY}")" k8s \
    "${SERVICE_ARGS[@]}"

echo "== install the operator =="
# One operator per cluster (Phase 15 A): its tree carries the Deployment, the cluster-scoped rights
# and the CRD, which a suite tree deliberately does not. Regenerated here rather than applied from
# the repository, because the committed tree names the published framework image while a CI cluster
# is given its own. `OPERATOR_ARTIFACT_URL` overrides where the operator's own artifact comes from —
# the operator runs this realm, so it fetches it exactly as a suite's processes fetch theirs.
ROOT="$(git rev-parse --show-toplevel)"
OPERATOR_TREE="${OPERATOR_TREE:-${ROOT}/realm/blong-kustomize/system/operator}"
rm -rf "${OPERATOR_TREE}"
ARTIFACT_ARGS=()
if [[ -n "${OPERATOR_ARTIFACT_URL:-}" ]]; then
    # The volume is a sibling of `suite` in the plan's config, not a member of it: the cache
    # DaemonSet the install tree writes fetches whatever `suiteVolume.artifact` names, and a
    # nested spelling is dropped without a word, so the operator's prefetch went to the
    # published GitHub release and failed on a cluster with no egress (F-396, F-404).
    ARTIFACT_ARGS+=(--kustomize.deploy.suiteVolume.artifact.url="${OPERATOR_ARTIFACT_URL}")
fi
(
    cd "${ROOT}/realm/blong-kustomize"
    node --conditions=development "${ROOT}/core/blong-gogo/bin/blong.ts" \
        "${ROOT}/realm/blong-kustomize/operator-entry.ts" k8s \
        --kustomize.deploy.outputDir="${OPERATOR_TREE}" \
        --kustomize.deploy.suite.frameworkImage="${FRAMEWORK_IMAGE:-docker.io/library/blong-gogo}" \
        --kustomize.deploy.suite.minFrameworkVersion="${FRAMEWORK_VERSION:-1}" \
        "${ARTIFACT_ARGS[@]}"
)
# The pair a namespace shares, written *before* the pods that read it. The operator would create it
# on its own reconcile pass, but its own pod serves the deployment UI from its first start, and a
# tenant's Deployments applied a moment before that pass would run on the framework's per-process
# fallback until they restarted. Idempotent by design: an existing pair is the point of the name,
# because a browser's session has to outlive a restart and a second replica (T-252).
#
# A Secret under this name that holds no rc document was written by an earlier revision of this
# realm — the pair used to travel as two variables, and a pod mounting it now would read nothing —
# so it is removed and made again. Only the name and the shape decide: a Secret somebody owns under
# this name and in this shape is never touched.
keys_ensure() {
    local namespace="$1"
    if kubectl -n "${namespace}" get secret gateway-keys >/dev/null 2>&1 &&
        [[ -z "$(kubectl -n "${namespace}" get secret gateway-keys -o jsonpath='{.data.config}' 2>/dev/null)" ]]; then
        kubectl -n "${namespace}" delete secret gateway-keys
    fi
    node --conditions=development "${ROOT}/realm/blong-kustomize/bin/kustomize.ts" \
        keys-ensure --namespace="${namespace}"
}
keys_ensure blong-system
kubectl apply -k "${OPERATOR_TREE}"
# After the rollout, not before: an operator pod from the previous revision keeps reconciling until
# it is gone, and it would write the shape it knows over the pair this step just renewed.
kubectl -n blong-system rollout status deployment/blong-operator --timeout=300s
keys_ensure blong-system

echo "== apply =="
# The namespace exists before the Secret that lives in it: the tenant's namespace is created by the
# tree applied next, and a Secret cannot be written into one that is not there yet.
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
keys_ensure "${NAMESPACE}"
kubectl apply -k "${TREE}"

# The two halves the apply cannot reach. A running cluster keeps what it already fetched: the cache
# DaemonSet's init container only downloads on start, so a changed artifact under the same URL and
# version is not noticed, and a pod keeps executing the code it started with. On an empty cluster
# every step here is a no-op, which is why it runs unconditionally rather than behind a flag.
#
# `REFRESH=0` turns it off, which is what a run that only wants the objects applied wants (a CI job
# that installed this revision a moment ago), and what a caller wants when it published nothing.
if [[ "${REFRESH:-1}" != "0" ]]; then
    echo "== refresh =="
    kubectl -n blong-system exec deploy/blong-operator -- \
        sh -c 'rm -rf /cache/*/ /cache/generations' 2>/dev/null || true
    kubectl -n blong-system rollout restart daemonset/cache 2>/dev/null || true
    kubectl -n "${NAMESPACE}" rollout restart daemonset/cache 2>/dev/null || true
    kubectl -n blong-system rollout status daemonset/cache --timeout=300s || true
    kubectl -n "${NAMESPACE}" rollout status daemonset/cache --timeout=300s || true
    kubectl -n blong-system rollout restart deployment/blong-operator 2>/dev/null || true
    kubectl -n "${NAMESPACE}" rollout restart deployment 2>/dev/null || true
    kubectl -n blong-system rollout status deployment/blong-operator --timeout=300s || true
fi

echo "== wait =="
kubectl -n "${NAMESPACE}" wait --for=condition=Available deployment --all --timeout=300s
# `rollout status` takes one resource, not `--all` (which `kubectl wait` accepts), so the workloads
# are listed and each is waited for: an Available Deployment may still be mid-rollout, with the old
# pod and the new one both running, and a report that called that converged would be wrong. A tree
# with no DaemonSet simply lists none.
for resource in $(kubectl -n "${NAMESPACE}" get deployment,daemonset -o name); do
    kubectl -n "${NAMESPACE}" rollout status "${resource}" --timeout=300s
done

echo "== the release step ran =="
# The Job the tree carries *is* the schema step: a deployed process runs `release`, and the schema is
# created by the short-lived `upgrade` run beside it (D-431). A Job that is missing, or that never
# completed, is a cluster with no tables — which is what a double-escaped `release.imports` produced
# while every pod still looked healthy (F-415), so it is asserted before anything reads a table.
JOB="$(kubectl -n "${NAMESPACE}" get jobs -o name 2>/dev/null | grep migrate | head -1 || true)"
if [[ -z "${JOB}" ]]; then
    echo "FAIL: the tree carries no migration Job, so nothing created the schema" >&2
    exit 1
fi
# What the Job *runs* is checked as well as that it ran: a tree regenerated by hand can carry the
# attempt an older generator wrote, and the shape that shipped once lost the deployment's config
# because a positional followed a flag — it dialled `127.0.0.1:3306` while every pod beside it
# connected to `db` (F-414). The positionals are the entry, `upgrade` and the deployment's intents,
# with `release` last, because that is the name the rc files it mounts are read by (T-253, T-268).
JOB_ARGS="$(kubectl -n "${NAMESPACE}" get "${JOB}" -o jsonpath='{.spec.template.spec.containers[0].args[*]}')"
POSITIONAL=()
seen_flag=0
for argument in ${JOB_ARGS}; do
    if [[ "${argument}" == --* ]]; then
        seen_flag=1
        continue
    fi
    if [[ "${seen_flag}" == 1 ]]; then
        echo "FAIL: the migration step has '${argument}' after a flag, where the parser reads it as that flag's value (T-267)" >&2
        exit 1
    fi
    POSITIONAL+=("${argument}")
 done
if [[ "${POSITIONAL[1]:-}" != "upgrade" || "${POSITIONAL[${#POSITIONAL[@]}-1]:-}" != "release" ]]; then
    echo "FAIL: the migration step runs '${POSITIONAL[*]}', not the entry, upgrade and release (T-268)" >&2
    exit 1
fi
kubectl -n "${NAMESPACE}" wait --for=condition=complete "${JOB}" --timeout=600s
echo "${JOB} completed"

echo "== portals =="
# The portal objects are read back from the cluster rather than named here: the alias is the
# Service's name and the host is the Ingress's, so asking the cluster is exactly what a reader would
# do — and it checks the two halves landed together. A suite with no portal has no Ingress at all,
# which is ordinary rather than a failure.
INGRESSES=$(kubectl -n "${NAMESPACE}" get ingress -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)
if [[ -z "${INGRESSES}" ]]; then
    echo "no portal: the suite declares none, or the one it declares has no host"
else
    for ingress in ${INGRESSES}; do
        host=$(kubectl -n "${NAMESPACE}" get ingress "${ingress}" -o jsonpath='{.spec.rules[0].host}')
        service=$(kubectl -n "${NAMESPACE}" get ingress "${ingress}" \
            -o jsonpath='{.spec.rules[0].http.paths[0].backend.service.name}')
        echo "${ingress}: host ${host:-<none>}, backend ${service}"
        endpoints=$(kubectl -n "${NAMESPACE}" get endpoints "${service}" \
            -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null || true)
        if [[ -z "${endpoints}" ]]; then
            echo "FAIL: ${service} has no endpoints, so the portal's path leads nowhere" >&2
            exit 1
        fi
        # The page, through the Service rather than through the Ingress: serving a host needs an
        # ingress controller, and a bare k3d cluster has none (this one was created without one).
        # So the object graph is asserted above and the content here — one port-forward and one
        # request, which is what a reader without DNS would do anyway. `/s/` is the prefix the
        # suite's browser build uses (`base: '/s/'`), so a page here means the artifact carried the
        # bundle and the process is serving it.
        kubectl -n "${NAMESPACE}" port-forward "service/${service}" 18080:8080 >/dev/null 2>&1 &
        forward=$!
        sleep 2
        if curl -fsS --max-time 10 http://127.0.0.1:18080/s/ | head -c 200 | grep -qi "<html\|<!doctype"; then
            echo "the portal serves a page at /s/"
        else
            echo "WARN: ${service} did not answer /s/ with a page — the artifact may carry no bundle" >&2
        fi
        # A page is not a working deployment: it is static files, and the artifact carried them
        # whether or not a single table exists. The login is the other half — `login.token.create`
        # reads and writes the credential tables, so an answer that carries a token is what says the
        # released process reached a schema (T-266, F-415). It needs a credential the cluster was
        # seeded with, which a deployment has no way to invent, so the check is opt-in:
        #
        #     BLONG_TEST_USER=… BLONG_TEST_PASSWORD=… scripts/k3d-e2e.sh
        #
        # A cluster whose login realm names no credential answers with a domain error rather than a
        # token, and that is reported as a warning naming the answer, because the missing piece is a
        # seed and not a broken deployment.
        if [[ -z "${BLONG_TEST_USER:-}" || -z "${BLONG_TEST_PASSWORD:-}" ]]; then
            echo "WARN: BLONG_TEST_USER/BLONG_TEST_PASSWORD unset, so the login round trip was skipped" >&2
        else
            # The endpoint expects an MLE-encrypted request: a plain POST is answered with a 400 that
            # carries jose's key error, which reads like a broken key configuration and is not one
            # (T-273). `blong-dev proxy` does the handshake and encrypts, and it is the transport an
            # MLE client uses, so it is also what makes the answer readable.
            blong-dev proxy --port 18099 --target http://127.0.0.1:18080 --no-login >/dev/null 2>&1 &
            proxy=$!
            sleep 2
            answer="$(curl -fsS --max-time 20 -X POST \
                http://127.0.0.1:18099/rpc/login/token/create \
                -H 'content-type: application/json' \
                -d "{\"params\":{\"username\":\"${BLONG_TEST_USER}\",\"password\":\"${BLONG_TEST_PASSWORD}\"}}" \
                2>/dev/null || true)"
            kill "${proxy}" 2>/dev/null || true
            wait "${proxy}" 2>/dev/null || true
            if grep -q 'access_token' <<<"${answer}"; then
                echo "the login answers with a token, so the released process reached its credential tables"
            else
                echo "WARN: the login did not answer with a token: ${answer}" >&2
            fi
            # The answer carries the pair a client uses to verify the server and to encrypt to it, and
            # it may carry only the public halves: the private signing key behind this deployment mints
            # tokens the gateway verifies, so a `d` here hands the deployment to every caller who can
            # log in (T-274). This is the assertion, and a leak fails the run rather than warning.
            if grep -qE '"(d|p|q|dp|dq|qi|k)":' <<<"${answer}"; then
                echo "FAIL: the login answer carries private key material" >&2
                exit 1
            fi
            echo "the login answer carries no private key material"
            # A released process publishes the CRUD validations of its public models, and that is a
            # claim about two modules agreeing: the port collects the models into a store at the
            # package root and `subject.validation` reads it (D-459). When they disagree the process
            # still starts and the gateway still answers — it accepts everything, because no
            # validation was built — which is how a released suite passed every check while serving
            # payloads no model allows (F-437). Asking for a type violation is what distinguishes the
            # two: `isActive` is a boolean in the model, so a string must be refused by name.
            #
            # The call is an `edit` of an id no suite has, so a run without validations writes
            # nothing: a check that repaired the state it is checking would report on its own work.
            refusal="$(curl -fsS --max-time 20 -X POST \
                http://127.0.0.1:18099/rpc/access/access/edit \
                -H 'content-type: application/json' \
                -d '{"params":{"access":{"accessId":"00000000-0000-0000-0000-000000000000","isActive":"not-a-boolean"}}}' \
                2>/dev/null || true)"
            if grep -q 'must be boolean' <<<"${refusal}"; then
                echo "and the published validation refuses a payload the model does not allow"
            else
                echo "WARN: the gateway answered no validation refusal: ${refusal}" >&2
            fi
        fi
        kill "${forward}" 2>/dev/null || true
        wait "${forward}" 2>/dev/null || true
    done
fi

echo "== pods on which nodes =="
kubectl -n "${NAMESPACE}" get pods -o custom-columns=\
'POD:.metadata.name,NODE:.spec.nodeName,STATUS:.status.phase'

# A released process renders no `semlog://` reference, and that is an assertion rather than a
# setting: the stores behind a reference come from the merged config, and a deployment's own rc file
# can configure them for a process whose intent says not to render one — which is how a released pod
# printed `config: semlog://p/<id>` for a payload nobody reads from that stream (T-243). Checked on
# every running container of the suite, because the platforms differ in which logger they pick.
echo "== a released process renders no semlog reference =="
references=0
for pod in $(kubectl -n "${NAMESPACE}" get pods -o name | grep -v '/cache-' || true); do
    count="$(kubectl -n "${NAMESPACE}" logs "${pod}" --all-containers --tail=1000 2>/dev/null | grep -c 'semlog://' || true)"
    if [[ "${count}" != "0" ]]; then
        echo "FAIL: ${pod} printed ${count} semlog reference(s)" >&2
        kubectl -n "${NAMESPACE}" logs "${pod}" --all-containers --tail=1000 2>/dev/null | grep 'semlog://' | head -3 >&2
        references=$((references + count))
    fi
done
if [[ "${references}" != "0" ]]; then
    exit 1
fi
echo "no container printed a semlog reference"

echo "== services =="
kubectl -n "${NAMESPACE}" get services

echo "== external name alias =="
kubectl -n "${NAMESPACE}" get service db -o jsonpath='{.spec.type} {.spec.externalName}{"\n"}' || true

# The services a deployment brings with it (Phase 15 I): the plan derives them from the adapters the
# suite activated, so the tree carries a workload, a claim, a ConfigMap and a Secret for each, and an
# ExternalName alias in the suite's own namespace. The unit tests pin the objects the generator
# writes; nothing but this run shows that one of them starts, and the alias is the half a realm's
# config depends on, because it keeps naming the service rather than a host.
echo "== the services the deployment brought with it =="
# A service the deployment switched off leaves no trace in the tree it asked for: no workload, no
# claim, no alias and no namespace. The objects an earlier pass created are the *operator's* to prune,
# which is what the CR field is for, so this asserts the tree and says where the rest is asserted.
if [[ -n "${SERVICE_OFF:-}" ]]; then
    for leftover in "services/${SERVICE_OFF}" "external-services/${SERVICE_OFF}.yaml"; do
        if [[ -e "${TREE}/${leftover}" ]]; then
            echo "FAIL: the tree still carries ${leftover}" >&2
            exit 1
        fi
    done
    echo "the tree carries nothing of ${SERVICE_OFF}: the switch removed it"
    # And the objects an earlier pass wrote into the suite's namespace are gone with it, the
    # credentials copy among them: a Secret left behind is a password a rotation never reaches, and
    # the workload's own copy in the services namespace is what stays (D-461, D-462).
    if kubectl -n "${NAMESPACE}" get "secret/${SERVICE_OFF}-credentials" >/dev/null 2>&1; then
        echo "FAIL: the credentials copy survived the switch in ${NAMESPACE}" >&2
        exit 1
    fi
    echo "and the pass removed the credentials copy it wrote there, while the workload kept its own"
    echo "(the alias the operator deletes, and the workload it reports instead, are asserted by the"
    echo "job after Ready: a pass prunes inside the suite's namespace and nothing wider, D-461)"
fi
SERVICES_NAMESPACE="$(ls "${TREE}/namespaces" 2>/dev/null | sed -n 's/\.yaml$//p' |
    grep -v -e '^kustomization$' -e "^${NAMESPACE}$" | head -1 || true)"
if [[ -z "${SERVICES_NAMESPACE}" ]]; then
    echo "the tree carries no service namespace — no service is left to bring"
else
    echo "namespace ${SERVICES_NAMESPACE}"
    for name in $(ls "${TREE}/services" | grep -v '\.yaml$' || true); do
        kubectl -n "${SERVICES_NAMESPACE}" rollout status "deployment/${name}" --timeout=300s
        # Storage is the descriptor's, and a claim that never binds is the difference between a
        # database that keeps its data and one that starts anyway.
        if kubectl -n "${SERVICES_NAMESPACE}" get "pvc/${name}-data" >/dev/null 2>&1; then
            kubectl -n "${SERVICES_NAMESPACE}" wait --for=jsonpath='{.status.phase}'=Bound \
                "pvc/${name}-data" --timeout=180s
        fi
        host="$(kubectl -n "${NAMESPACE}" get service "${name}" -o jsonpath='{.spec.externalName}')"
        if [[ "${host}" != "${name}.${SERVICES_NAMESPACE}.svc.cluster.local" ]]; then
            echo "FAIL: ${name} resolves to '${host}' from ${NAMESPACE}" >&2
            exit 1
        fi
        # A pod reads only the Secrets of its own namespace, so the values the workload reads are
        # written in the suite's as well — that is the copy the deployment dials the alias with
        # (D-462). Compared rather than counted: two Secrets of one name holding different passwords
        # is the failure this catches, and it is invisible to a check that only asks whether one exists.
        if kubectl -n "${SERVICES_NAMESPACE}" get secret "${name}-credentials" >/dev/null 2>&1; then
            beside="$(kubectl -n "${SERVICES_NAMESPACE}" get secret "${name}-credentials" \
                -o jsonpath='{.data}' | sha256sum)"
            in_suite="$(kubectl -n "${NAMESPACE}" get secret "${name}-credentials" \
                -o jsonpath='{.data}' | sha256sum)"
            if [[ "${beside}" != "${in_suite}" ]]; then
                echo "FAIL: ${name}-credentials holds different values in ${NAMESPACE}" >&2
                exit 1
            fi
            echo "${name}-credentials is readable in ${NAMESPACE} with the workload's own values"
        fi
        port="$(kubectl -n "${NAMESPACE}" get service "${name}" -o jsonpath='{.spec.ports[0].port}')"
        # Dialled from a process of the suite, in the suite's namespace: the name in the realm's
        # config is the only form a deployment ever uses, so resolving it there is the claim. The pod
        # is chosen by *container* readiness rather than by phase — a pod whose container is in a
        # crash loop is `Running` with nothing to exec into, which would turn this check into a
        # silent skip on exactly the cluster that needs it (F-441).
        probe_pod="$(kubectl -n "${NAMESPACE}" get pods --field-selector=status.phase=Running \
            -o custom-columns='NAME:.metadata.name,READY:.status.containerStatuses[*].ready' \
            --no-headers 2>/dev/null |
            awk '$2 ~ /true/ && $1 !~ /^cache-/ {print $1; exit}' || true)"
        # `node --version` rather than `command -v node`: what runs through `kubectl exec` is an
        # executable, not a shell, so the builtin would answer "exec: command: not found" and the
        # probe would be skipped on a process that carries node.
        if [[ -n "${probe_pod}" ]] &&
            kubectl -n "${NAMESPACE}" exec "${probe_pod}" -- node --version >/dev/null 2>&1; then
            kubectl -n "${NAMESPACE}" exec "${probe_pod}" -- node -e '
                const net = require("net");
                const [port, host] = process.argv.slice(1);
                const socket = net.connect(Number(port), host);
                socket.setTimeout(5000);
                socket.on("connect", () => { console.log("connected to " + host); socket.end(); });
                socket.on("timeout", () => { console.error("FAIL: timed out dialling " + host); process.exit(1); });
                socket.on("error", error => { console.error("FAIL: " + error.message); process.exit(1); });
            ' "${port}" "${name}"
        else
            echo "no running pod carrying node — the alias is checked, its resolution is not"
        fi
    done
    kubectl -n "${SERVICES_NAMESPACE}" get deployment,service,pvc
fi

echo "== suite version directory on each node =="
for node in $(kubectl get nodes -o name | sed 's|node/||'); do
    echo -n "${node}: "
    k3d node get "${node}" >/dev/null 2>&1 && echo "check /var/lib/blong/suites/${NAMESPACE}/ inside the node" || echo "unknown"
done

echo "done — tear down with: k3d cluster delete ${CLUSTER}"
