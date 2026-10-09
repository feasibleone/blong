#!/usr/bin/env bash
#
# The developer's cycle, in one command: everything that has to happen *outside* the cluster before
# `k3d-e2e.sh` can do its half.
#
# `k3d-e2e.sh` is the CI half — it generates the trees, applies them, waits and asserts, and it takes
# its image and its artifacts from wherever the caller points it (a release, a registry, a job that
# built them a moment ago). A developer's machine has none of that, so this wrapper does the parts
# that talk to the machine rather than to the cluster:
#
#   1. the k3d cluster, created if it is not there (one agent node, because cache pods and volumes are
#      per node and a single-node cluster hides half of the scheduling story);
#   2. the suite's browser bundle (`vite build`), because the portal's page is built by the suite and
#      a `rush deploy` carries whatever `dist/` holds at that moment — a deploy without a build
#      carries sources and the page 404s;
#   3. the framework image, tagged with the reference the trees name, saved and imported into every
#      node: a k3d node cannot pull from the host, and a rebuilt image is the difference between
#      running the framework you just changed and running the one from last week (F-420);
#   4. the two artifacts — `rush deploy --scenario operator` and `--scenario suite`, zipped — copied
#      into a file server inside the cluster, because the prefetch DaemonSet `curl`s them from a pod;
#   5. `k3d-e2e.sh` itself, with `REFRESH=1`: the operator's cached copies are dropped and every cache
#      pod, the operator and the tenant processes are restarted, so the cluster runs what was just
#      published rather than what it fetched earlier.
#
# Everything it changes on the machine it asks about first (`ASSUME_YES=1` to skip the questions, and
# `BUILD_SUITE=0` / `BUILD_IMAGE=0` / `PUBLISH_ARTIFACTS=0` to leave a step out).
#
# Usage:
#   realm/blong-kustomize/scripts/k3d-dev-cycle.sh

set -euo pipefail

CLUSTER="${CLUSTER:-dev-cluster}"
NAMESPACE="${NAMESPACE:-blong-suite}"
AGENTS="${AGENTS:-1}"
ROOT="$(git rev-parse --show-toplevel)"
SUITE_PACKAGE="${SUITE_PACKAGE:-suite/blong-suite}"
FRAMEWORK_IMAGE="${FRAMEWORK_IMAGE:-docker.io/library/blong-gogo}"
FRAMEWORK_VERSION="${FRAMEWORK_VERSION:-1}"
LOCAL_IMAGE="${LOCAL_IMAGE:-localhost/blong-gogo:${FRAMEWORK_VERSION}}"
ARTIFACT_SERVICE="${ARTIFACT_SERVICE:-blong-artifact}"
ARTIFACT_NAMESPACE="${ARTIFACT_NAMESPACE:-default}"
ARTIFACT_URL_HOST="http://${ARTIFACT_SERVICE}.${ARTIFACT_NAMESPACE}.svc.cluster.local"
BUILD_SUITE="${BUILD_SUITE:-1}"
BUILD_IMAGE="${BUILD_IMAGE:-1}"
PUBLISH_ARTIFACTS="${PUBLISH_ARTIFACTS:-1}"

say() { printf '\n== %s ==\n' "$1"; }

# Ask before a step that changes the machine. A non-interactive run answers yes, because the caller
# that cannot answer is the one that asked for the whole cycle (and `ASSUME_YES` says so explicitly).
ask() {
    if [[ "${ASSUME_YES:-0}" == "1" ]]; then
        return 0
    fi
    if [[ ! -t 0 ]]; then
        echo "   (no terminal to ask; running it) -- $1"
        return 0
    fi
    read -r -p "   $1 [y/N] " answer
    [[ "${answer}" == [yY]* ]]
}

for tool in k3d podman kubectl; do
    command -v "${tool}" >/dev/null 2>&1 || {
        echo "FAIL: ${tool} is not on PATH" >&2
        exit 1
    }
done

say "cluster ${CLUSTER}"
if k3d cluster list --no-headers 2>/dev/null | awk '{print $1}' | grep -qx "${CLUSTER}"; then
    echo "exists"
elif ask "create it with ${AGENTS} agent node(s)"; then
    k3d cluster create "${CLUSTER}" --agents "${AGENTS}"
else
    echo "FAIL: create it, or point CLUSTER at one that exists" >&2
    exit 1
fi

NODES=$(kubectl get nodes -o name | sed 's|^node/||')
[[ -n "${NODES}" ]] || {
    echo "FAIL: the cluster reports no nodes" >&2
    exit 1
}

if [[ "${BUILD_SUITE}" == "1" ]]; then
    say "suite bundle"
    # The portal is the suite's own `vite build` output, so it has to exist *before* the deploy that
    # is supposed to carry it.
    (cd "${ROOT}/${SUITE_PACKAGE}" && npm run build)
fi

if [[ "${BUILD_IMAGE}" == "1" ]]; then
    say "framework image"
    # Built once and imported per node: `localhost/...` is a host reference, and `docker.io/library`
    # is what the generated trees name. The epoch is taken first because the retention after the
    # import loop has to tell the layers this run creates from the ones it inherited.
    BUILD_STARTED=$(date +%s)
    podman build -f "${ROOT}/core/blong-gogo/docker/blong-gogo.Dockerfile" -t "${LOCAL_IMAGE}" "${ROOT}"
    podman tag "${LOCAL_IMAGE}" "${FRAMEWORK_IMAGE}:${FRAMEWORK_VERSION}"
    podman save "${FRAMEWORK_IMAGE}:${FRAMEWORK_VERSION}" -o /tmp/blong-gogo-cycle.tar
    for node in ${NODES}; do
        podman cp /tmp/blong-gogo-cycle.tar "${node}:/tmp/blong-gogo-cycle.tar"
        podman exec "${node}" ctr -n k8s.io images import /tmp/blong-gogo-cycle.tar >/dev/null
        echo "   imported into ${node}"
    done
    rm -f /tmp/blong-gogo-cycle.tar
    # Every build leaves its stage images behind — the base image, the context copies, the
    # workspace install and the deploy tree, about 6 GB — and nothing else removes them: five
    # such chains had accumulated while `podman system df` reported 25.86 GB reclaimable (F-379).
    # They are the build cache as well, so dropping all of them, as the first version of this line
    # did, made every later build re-run `rush install` and `rush deploy`: four cache hits and 138
    # seconds cold, against seventy-two and 9 seconds once this line ran in between (F-425). A
    # generation older than this run is one the next build cannot reuse, so `until` takes exactly
    # those, and prune leaves alone whatever the chain just built still references.
    podman image prune -f --filter dangling=true --filter "until=$(( $(date +%s) - BUILD_STARTED ))s"
fi

say "file server"
# The prefetch is `curl` inside a pod, so the artifact has to be reachable by Service name. A cluster
# that already serves one is left alone; one that does not gets the smallest thing that works.
if kubectl -n "${ARTIFACT_NAMESPACE}" get service "${ARTIFACT_SERVICE}" >/dev/null 2>&1; then
    echo "${ARTIFACT_SERVICE}.${ARTIFACT_NAMESPACE} exists"
elif ask "create an nginx Deployment and Service as ${ARTIFACT_SERVICE}"; then
    # nginx comes from the registry, which a cluster with no egress cannot reach either: the image is
    # imported the same way the framework's is, from the host's copy.
    podman image exists docker.io/library/nginx:alpine || podman pull docker.io/library/nginx:alpine
    podman save docker.io/library/nginx:alpine -o /tmp/nginx-cycle.tar
    for node in ${NODES}; do
        podman cp /tmp/nginx-cycle.tar "${node}:/tmp/nginx-cycle.tar"
        podman exec "${node}" ctr -n k8s.io images import /tmp/nginx-cycle.tar >/dev/null
    done
    rm -f /tmp/nginx-cycle.tar
    kubectl -n "${ARTIFACT_NAMESPACE}" create deployment artifact --image=nginx:alpine
    kubectl -n "${ARTIFACT_NAMESPACE}" expose deployment artifact --name="${ARTIFACT_SERVICE}" --port=80
    kubectl -n "${ARTIFACT_NAMESPACE}" wait --for=condition=Available deployment/artifact --timeout=180s
else
    echo "FAIL: create it, or point ARTIFACT_SERVICE at the one that serves artifacts" >&2
    exit 1
fi

if [[ "${PUBLISH_ARTIFACTS}" == "1" ]]; then
    say "artifacts"
    # Both scenarios, because the operator runs *this* realm from its own artifact and the tenant runs
    # the suite from the other: a fresh `kustomize.zip` alone leaves a tenant's tree as it was, and a
    # fresh `suite.zip` alone leaves the operator planning with the code it already had (D-438's
    # neighbourhood — the two are published separately and both matter).
    node "${ROOT}/common/scripts/install-run-rush.js" deploy --scenario operator \
        --target-folder /tmp/blong-cycle-operator --overwrite >/dev/null
    node "${ROOT}/common/scripts/install-run-rush.js" deploy --scenario suite \
        --target-folder /tmp/blong-cycle-suite --overwrite >/dev/null
    # `make_archive` zips the *contents* of the folder, which is what the container's `unzip -d` wants.
    for scenario in operator suite; do
        rm -f "/tmp/blong-cycle-${scenario}.zip"
        python3 -c "import shutil; shutil.make_archive('/tmp/blong-cycle-${scenario}','zip','/tmp/blong-cycle-${scenario}')"
    done
    POD=$(kubectl -n "${ARTIFACT_NAMESPACE}" get pods -l app=artifact \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)
    POD="${POD:-$(kubectl -n "${ARTIFACT_NAMESPACE}" get pods -o jsonpath='{.items[0].metadata.name}')}"
    kubectl -n "${ARTIFACT_NAMESPACE}" cp /tmp/blong-cycle-operator.zip \
        "${POD}:/usr/share/nginx/html/kustomize.zip"
    kubectl -n "${ARTIFACT_NAMESPACE}" cp /tmp/blong-cycle-suite.zip \
        "${POD}:/usr/share/nginx/html/suite.zip"
    echo "   published kustomize.zip and suite.zip to ${POD}"
fi

say "the cycle"
(
    cd "${ROOT}/${SUITE_PACKAGE}"
    CLUSTER="${CLUSTER}" \
        NAMESPACE="${NAMESPACE}" \
        SUITE_ENTRY=./index.ts \
        TREE=system/kustomize \
        SERVICE_OFF="${SERVICE_OFF:-}" \
        ARTIFACT_URL="${ARTIFACT_URL:-${ARTIFACT_URL_HOST}/suite.zip}" \
        OPERATOR_ARTIFACT_URL="${OPERATOR_ARTIFACT_URL:-${ARTIFACT_URL_HOST}/kustomize.zip}" \
        FRAMEWORK_IMAGE="${FRAMEWORK_IMAGE}" \
        FRAMEWORK_VERSION="${FRAMEWORK_VERSION}" \
        bash "${ROOT}/realm/blong-kustomize/scripts/k3d-e2e.sh"
)

say "done"
echo "tear down with: k3d cluster delete ${CLUSTER}"
