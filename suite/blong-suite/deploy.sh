#!/usr/bin/env bash
#
# The developer's cycle, from the suite's own directory: the TypeScript runner does what
# `scripts/k3d-dev-cycle.sh` used to (the cluster, the browser bundle, the framework image, the two
# artifacts, then the runbook with `REFRESH=1`), and `suite/blong-suite` is the working directory
# the runbook expects — the same one the kustomize workflow uses for `suite deploy`.
#
# `PUBLISH_ARTIFACTS` is the setting that makes the cluster run the realm code you just changed: it
# republishes both artifacts, while the `BUILD_*` settings only decide what goes into them. Every
# value below is one run's choice, written beside the line it belongs to.
#
cd "$(dirname "$0")" || exit 1

# What the machine half builds and publishes.
export BUILD_IMAGE=1                     # build and import the framework image; 1 after framework
                                         # changes, 0 to reuse the one the cluster has
export BUILD_SUITE=1                     # build the suite's browser bundle; 1 after UI changes,
                                         # 0 to keep the bundle the last run published
export PUBLISH_ARTIFACTS=1               # publish both artifacts (suite.zip, kustomize.zip) to the
                                         # file server; keep 1 whenever realm or suite code changed
                                         # — this is the step that ships it
export REFRESH=1                         # drop the caches and restart everything; 0 to leave the
                                         # running workloads alone (1 is the default anyway)

# What the runbook deploys.
export SERVICE_OFF=mysql                 # deploy the suite without mysql, leaving the database to
                                         # the installation in blong-integration; set it only for a
                                         # run that is not about that service (its workload still
                                         # belongs to the tenant: see DROP_WORKLOADS)
export STOP_NAMING=1                     # after the cycle, tell the CR to stop asking for the
                                         # switched-off service: a pass reconciles the declaration, so
                                         # while it names the service it puts it back within the
                                         # minute. This is the half that makes the switch stick, and
                                         # the only half the deployment owns
export DROP_WORKLOADS=0                  # 0 keeps the workload, its claim and its Service in the
                                         # services namespace. They are the tenant's to retire, not
                                         # this script's (D-461), and the *next* cycle asserts they
                                         # are still there — so 1 makes the next run red on its own
                                         # switch-off check unless that run leaves SERVICE_OFF unset
                                         # (F-792). 1 frees the cluster; it is not the default
                                         # because a cycle has to be re-runnable

# How much the runbook asks.
#
# No test login is named: this deployment faces the internet, and a seed with a password somebody
# knows is the administrative UI with the lock left open. The run provisions its own login instead —
# a random name and secret, granted Admin for the length of the run, removed in a `finally` — and
# reads the database it writes to from the deployment's own rc Secret, so nothing about it is named
# here.
export ASSUME_YES=1                      # answer its confirmations with yes; 1 for unattended runs,
                                         # 0 to be asked before it changes anything
export CLUSTER=dev-cluster               # the k3d cluster to use; the runbook never creates one it
                                         # did not find (F-446)

# The cycle, then what it leaves behind.
node --conditions=development ../../test/blong-int-kustomize/bin/blongIntKustomize.ts cycle run
status=$?

# The old name for the pair below, honoured rather than ignored: a run that still sets it meant both
# halves, and a variable that quietly did nothing would read as a run that had cleaned up.
if [ "${DROP_SERVICES:-}" = 1 ]; then
    echo "DROP_SERVICES is now STOP_NAMING=1 DROP_WORKLOADS=1; this run takes it as both"
    STOP_NAMING=1
    DROP_WORKLOADS=1
fi

# After the run rather than before it: the CR the run applied names the service, so an earlier patch
# would be reconciled away by the run's own apply.
if [ "${STOP_NAMING:-0}" = 1 ]; then
    if [ -z "${SERVICE_OFF:-}" ]; then
        echo "STOP_NAMING=1 but SERVICE_OFF names nothing: no service was switched off to stop naming"
    elif ! command -v kubectl >/dev/null 2>&1; then
        echo "STOP_NAMING=1 but kubectl is not on PATH: leaving blong-services alone"
    else
        context="k3d-$CLUSTER"
        patchBody="{\"spec\":{\"services\":{\"$SERVICE_OFF\":false}}}"
        if kubectl --context "$context" -n blong-suite patch blongdeployments blong-suite \
                --type=merge -p "$patchBody" >/dev/null 2>&1; then
            echo "blong-suite no longer asks for $SERVICE_OFF"
        else
            echo "no blong-suite custom resource to patch: a pass may bring $SERVICE_OFF back"
        fi
        # The copies the deployment wrote into its own namespace outlive the tree that asked for
        # them, because removing them is pruning and a pass only prunes what it is told to: the
        # run's own check fails on the credentials copy the next time the service is switched off.
        kubectl --context "$context" -n blong-suite delete secret "$SERVICE_OFF-credentials" \
                --ignore-not-found
    fi
fi

# The tenant's objects, which the deployment does not own and the next cycle judges: a run that drops
# them has to be followed by one that names no SERVICE_OFF, or its switch-off check fails on a
# namespace this script emptied (F-792).
if [ "${DROP_WORKLOADS:-0}" = 1 ]; then
    if [ -z "${SERVICE_OFF:-}" ]; then
        echo "DROP_WORKLOADS=1 but SERVICE_OFF names nothing: no service was switched off to drop"
    elif ! command -v kubectl >/dev/null 2>&1; then
        echo "DROP_WORKLOADS=1 but kubectl is not on PATH: leaving blong-services alone"
    else
        context="k3d-$CLUSTER"
        # The workloads, not the namespace: that namespace holds the tenant Role and RoleBinding
        # the runbook applied so the operator can read and apply there, and the operator may not
        # re-create them — the RBAC kinds are install-owned. Deleting it took the grants with it and
        # every later pass failed to read the leftovers it was meant to report (F-461). What the
        # drop is after is the service, so it deletes the kinds a service is made of.
        if kubectl --context "$context" get namespace blong-services >/dev/null 2>&1; then
            kubectl --context "$context" -n blong-services \
                delete deployment,service,persistentvolumeclaim,configmap,secret,job,cronjob \
                -l "app.kubernetes.io/part-of=blong-suite" --ignore-not-found
            echo "dropped $SERVICE_OFF's workload: run the next cycle with SERVICE_OFF unset, "
            echo "or its switch-off check fails on the objects this run removed"
        else
            echo "blong-services is not in the cluster: nothing to drop"
        fi
    fi
fi

exit "$status"
