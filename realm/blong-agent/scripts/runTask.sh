#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Run one task through a Copilot runtime, and leave it in the portal to watch.
#
# This script does one thing: it triggers a task on a runtime account and says
# where to look at it. The backend and the portal are started by hand, and the
# runtimes are already installed on their hosts with their keys configured —
# neither is this script's job. Two terminals, then this:
#
#   cd realm/blong-agent
#   node --run blong-watch -- microservice integration dev playwright \
#       --config "$PWD/../../.blong_devrc" \
#       --gateway.port=8080 --resolution.portGateway=8080
#
#   node --run dev -- --port 5173            # http://localhost:5173/s/
#
# The intents matter and their order does too. The rc file is the LAST
# intent's, so `--config` names the dev rc explicitly; `integration` is what
# sets `canSkipSocket`, without which a `dev` run never finishes starting
# (`@@F-843`); `playwright` is what makes telemetry come from the in-memory
# ring, so the page streams with no broker in the picture.
#
# Usage:
#   scripts/runTask.sh <account> <prompt> [--instructions <text>]
#   scripts/runTask.sh <account> --task <file> [--instructions <text>]
#
#   scripts/runTask.sh nuc "Create ping.py that prints ping"
#   scripts/runTask.sh nuc --task scripts/tasks/ui-tour.md
#   scripts/runTask.sh minisforum "Create gcd.py that prints gcd(48, 18)" \
#       --instructions "Only create the file. Do not run any command."
#
# A task file is the prompt read from disk, which is how a scenario worth repeating
# (`scripts/tasks/`) stays out of the shell history and can be edited on its own.
#
# Environment:
#   WORKER   the worker id a claim and a run are made under (default: HOSTNAME)
#   SERVER   the `.blong_callrc` server the calls go to (default: `local`, the
#            gateway at http://localhost:8080)
#
# What it does, in order: check the account is reachable, claim a ticket, and run
# the session with the task as its prompt. The row is in the portal before the
# first turn is answered, so the page can be opened while the runtime is still
# working.
# ==============================================================================

usage() {
    sed -n '/^# Usage:/,/^# What it does/p' "$0" | sed 's/^# \{0,1\}//' >&2
    exit 2
}

[ $# -ge 1 ] || usage

# Flags may come before or after the positional, because both readings are natural to type:
# `runTask.sh nuc --task X` and `runTask.sh --task X nuc`.
positional=()
TASK_FILE=''
INSTRUCTIONS=''
while [ $# -gt 0 ]; do
    case "$1" in
        --task) TASK_FILE="${2:-}"; shift 2 ;;
        --instructions) INSTRUCTIONS="${2:-}"; shift 2 ;;
        -h|--help) usage ;;
        --*) echo "runTask: unknown argument $1" >&2; usage ;;
        *) positional+=("$1"); shift ;;
    esac
done
[ "${#positional[@]}" -ge 1 ] || usage
ACCOUNT="${positional[0]}"
PROMPT="${positional[1]:-}"
if [ -n "$TASK_FILE" ]; then
    [ -r "$TASK_FILE" ] || { echo "runTask: cannot read $TASK_FILE" >&2; exit 2; }
    PROMPT="$(cat "$TASK_FILE")"
fi
[ -n "$PROMPT" ] || usage
WORKER="${WORKER:-${HOSTNAME:-$(hostname)}}"
SERVER="${SERVER:-local}"

# The answer is JSON, and a failure prints a heading line before the error, so the
# payload is taken from the first brace on rather than from the whole output.
#
# `--plain` is for the pool's routes: `task.*` is served without auth, and the
# gateway decodes MLE only where the route requires it, so an encrypted body is
# refused with `gateway.mleUndecoded` rather than passed on unreadable.
call() {
    local method="$1" params="$2" out
    shift 2
    if ! out=$(blong-dev call "$method" "$params" --server "$SERVER" "$@" 2>&1); then
        echo "runTask: $method failed" >&2
        echo "$out" >&2
        exit 1
    fi
    printf '%s' "${out#"${out%%\{*}"}"
}

json() {
    jq -cn "$@"
}

echo "runTask: account $ACCOUNT, worker $WORKER"

checked=$(call engine.account.check "$(json --arg account "$ACCOUNT" '{account: $account}')")
if [ "$(jq -r '.reachable' <<<"$checked")" != 'true' ]; then
    echo "runTask: $ACCOUNT is not reachable — is its runtime up, and is the backend running?" >&2
    echo "$checked" >&2
    exit 1
fi
echo "runTask: runtime $(jq -r '.kind' <<<"$checked") in $(jq -r '.mode' <<<"$checked") mode at $(jq -r '.workspaceRoot' <<<"$checked")"

# The pool is the realm's in-process fixture, and it has no gateway surface: a task
# cannot be written into it from here, so the claim takes the first free ticket and
# the task itself travels as the prompt. The row is therefore named after that
# ticket rather than after the task (`@@T-818`).
claim=$(call agent.ticket.claim "$(json --arg workerId "$WORKER" --arg engineAccount "$ACCOUNT" \
    '{workerId: $workerId, engineAccount: $engineAccount}')")
ticketId=$(jq -r '.ticket.ticketId // empty' <<<"$claim")
ticketTitle=$(jq -r '.ticket.ticketTitle // empty' <<<"$claim")
sessionId=$(jq -r '.session.sessionId // empty' <<<"$claim")
mode=$(jq -r '.session.engineMode // empty' <<<"$claim")
if [ -z "$sessionId" ]; then
    echo "runTask: the claim opened no session — is the pool exhausted? restart the backend" >&2
    echo "$claim" >&2
    exit 1
fi

cat <<EOF
runTask: claimed $ticketId "$ticketTitle", session $sessionId in $mode mode
runTask: task — $PROMPT
runTask: watch it in the portal — Agent → Sessions → the newest row
runTask: leaving the run in the foreground; Ctrl-C leaves the session parked
EOF

run=$(call agent.session.run "$(json --arg sessionId "$sessionId" --arg workerId "$WORKER" \
    --arg prompt "$PROMPT" --arg instructions "$INSTRUCTIONS" \
    '{sessionId: $sessionId, workerId: $workerId, prompt: $prompt}
     + (if $instructions == "" then {} else {instructions: $instructions} end)')")

echo "runTask: status $(jq -r '.status // "unknown"' <<<"$run")"
jq -r '.summary // empty' <<<"$run" | sed 's/^/runTask: /'
