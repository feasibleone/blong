#!/usr/bin/env bash
#
# Update the operator in a k3d cluster from this working copy — one command, from the realm's own
# folder:
#
#     npm run deploy                 # source: republish the realm's artifact, apply the install tree
#     BUILD_IMAGE=1 npm run deploy   # also rebuild the framework image (after core/blong-gogo changes)
#
# and, later, from a release — nothing is built or published, the cluster gets what the release
# published. The realm's own release attaches `blong-kustomize-<version>.zip` and its digest, so the
# version is the only thing to name (default: this package's):
#
#     RELEASE=1 FRAMEWORK_VERSION=v1.43.1 npm run deploy
#     RELEASE=1 OPERATOR_VERSION=0.2.0 FRAMEWORK_VERSION=v1.43.1 npm run deploy
#
# Why the two halves matter: the operator process runs *this realm* from an artifact it fetches, and it
# starts from a framework image. A change to `realm/blong-kustomize` reaches a cluster only when the
# artifact is republished **and** the operator is restarted; a change to `core/blong-gogo` needs
# the image rebuilt and imported into every node as well. The steps live in the end-to-end runbook
# (`test/blong-int-kustomize`), which is what CI runs — this script only says which of them, in the
# order that matters, and leaves the cluster's state where it was when a step fails.
#
# The story of the first time this was needed: T-449 moved the image out of the committed base, and the
# fix sat in the working copy while the cluster kept running the artifact published hours earlier. No
# command existed that updated the operator alone, so the check was `grep` in its log instead of a
# rollout (@@D-653).
set -u

cd "$(dirname "$0")" || exit 1
ROOT=$(cd ../.. && pwd)
RUNBOOK="$ROOT/test/blong-int-kustomize/bin/blongIntKustomize.ts"

export CLUSTER="${CLUSTER:-dev-cluster}"        # the k3d cluster to update; never created here (F-446)
export FRAMEWORK_IMAGE="${FRAMEWORK_IMAGE:-docker.io/library/blong-gogo}"
export FRAMEWORK_VERSION="${FRAMEWORK_VERSION:-1}"

if [ "${RELEASE:-0}" = 1 ]; then
    # A release: the image is the published one, and the artifact is the asset the realm's release
    # attached. Nothing touches the machine, so this is the same command a pipeline would run against a
    # real cluster.
    export BUILD_IMAGE=0
    export BUILD_SUITE=0
    export PUBLISH_ARTIFACTS=0
    # Where the release lives is the deployment record's business, not this script's: the record names
    # the release prefix and the artifact, and the version names the file (@@D-654).
    if [ -z "${OPERATOR_ARTIFACT_URL:-}" ]; then
        record=$(jq -c '.operator' "$ROOT/.github/deployments.json" 2>/dev/null) || record=""
        if [ -z "$record" ]; then
            echo "RELEASE=1 has no OPERATOR_ARTIFACT_URL, and .github/deployments.json names no"
            echo "operator record to resolve it from: pass the URL, or run from the repository."
            exit 2
        fi
        release=$(jq -r '.release' <<<"$record")
        artifact=$(jq -r '.artifact' <<<"$record")
        version="${OPERATOR_VERSION:-$(jq -r '.version' "$ROOT/realm/blong-kustomize/package.json")}"
        repo="${OPERATOR_REPO:-feasibleone/blong}"
        OPERATOR_ARTIFACT_URL="https://github.com/$repo/releases/download/${release}-v${version}/"\
"${artifact%.zip}-${version}.zip"
        export OPERATOR_ARTIFACT_URL
    fi
    # The digest as well, because it is what names the directory the artifact lands in and the attempt
    # that runs from it (D-469): a version alone would make a rebuilt artifact reuse the directory the
    # previous one filled. The release publishes it beside the zip, so it is one small fetch — and an
    # explicit OPERATOR_ARTIFACT_DIGEST still wins, for a release that has none.
    if [ -z "${OPERATOR_ARTIFACT_DIGEST:-}" ]; then
        OPERATOR_ARTIFACT_DIGEST=$(curl -fsSL "${OPERATOR_ARTIFACT_URL}.sha256" 2>/dev/null | awk '{print $1}')
        if [ -z "${OPERATOR_ARTIFACT_DIGEST:-}" ]; then
            echo "no ${OPERATOR_ARTIFACT_URL}.sha256: the release publishes one beside the zip."
            echo "Pass OPERATOR_ARTIFACT_DIGEST to install an artifact whose digest is not there."
            exit 2
        fi
        export OPERATOR_ARTIFACT_DIGEST
    fi
    echo "operator from release: $FRAMEWORK_IMAGE:$FRAMEWORK_VERSION"
    echo "                       $OPERATOR_ARTIFACT_URL"
    echo "                       ${OPERATOR_ARTIFACT_DIGEST:0:12}…"
    ASSUME_YES="${ASSUME_YES:-1}" node --conditions=development "$RUNBOOK" operator deploy "$@" || exit $?
    exit 0
fi

# From source: the realm's artifact is republished and applied. The suite's bundle and artifact are
# not touched, and neither is the image unless it is asked for — the operator does not serve the page,
# and a change to this realm is not a change to the framework.
export OPERATOR_ONLY=1
export BUILD_IMAGE="${BUILD_IMAGE:-0}"
export PUBLISH_ARTIFACTS="${PUBLISH_ARTIFACTS:-1}"
export ASSUME_YES="${ASSUME_YES:-1}"             # the runbook asks only when it would create a cluster

node --conditions=development "$RUNBOOK" cycle run "$@"
