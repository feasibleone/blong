#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Blong Copilot runtime worker provisioning (Ubuntu)
#
# Usage:
#   sudo bash copilot-runtime.sh [ORCHESTRATOR_IP] [CONNECTION_TOKEN]
#
# The secrets live in the worker's environment file, /etc/blong/copilot-worker.env, which this
# script preserves: seed it (root-only) with GH_TOKEN and COPILOT_PROVIDER_API_KEY before the run
# and no secret appears on the command line. `sudo GH_TOKEN=... bash ...` is accepted, and leaves
# the value in sudo's argument list for the whole run and in the shell history.
#
# GH_TOKEN is the GitHub credential the agent works with: a fine-grained token, limited to the
# repositories this worker serves, that also lets `gh` open pull requests, read CI and touch
# issues. GitHub's guidance puts a fine-grained token in GH_TOKEN rather than in a stored login.
#
# The worker serves the realm's `copilot` accounts: it owns the harness, the tools and the
# session store. It answers over plain TCP, so the port belongs on a private network. Re-running
# the script upgrades the runtime and keeps the secrets already written.
# ==============================================================================

ORCHESTRATOR_IP="${1:-}"
CONNECTION_TOKEN_ARG="${2:-}"
# Written beside the token so the host can be exercised by hand. This runtime build does not read
# it: a realm session carries its own key, taken from the account's `apiKeyEnv`.
PROVIDER_API_KEY="${COPILOT_PROVIDER_API_KEY:-}"
# The lockdown flushes the port list; a host whose sshd listens elsewhere says so here.
SSH_PORT="${SSH_PORT:-22}"

# GitHub access for the harness: its bundled skills shell out to `gh` for pull requests, issues,
# `gh api` and CI status, and git presents the same token through gh's credential helper.
GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
# A repository to prove the token against (`owner/name`); unset, only the token itself is checked.
GH_REPO="${GH_REPO:-}"
GH_VERSION="2.105.0"
GH_ARCH=""
GH_LOGIN=""
GH_ACCESS_TOKEN=""
# The endpoint and model the provider check names - the same pair a realm account carries.
PROVIDER_BASE_URL="${PROVIDER_BASE_URL:-https://api.deepseek.com/v1}"
PROVIDER_MODEL="${PROVIDER_MODEL:-deepseek-flash}"
PROVIDER_STATE="not set (a realm session sends its own with the ticket)"

# Pinned to the version the realm's SDK declares (`copilotCliVersion` in @microsoft/copilot-sdk):
# a runtime outside the SDK's protocol window fails the connection handshake, so bump both.
RUNTIME_VERSION="1.0.114"

PORT="4321"
SERVICE_NAME="copilot-worker"
SERVICE_USER="copilot"
BASE_DIR="/var/lib/blong"
WORKSPACES_DIR="${BASE_DIR}/workspaces"
STATE_DIR="${BASE_DIR}/copilot-state"
ENV_FILE="/etc/blong/${SERVICE_NAME}.env"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
INSTALL_ROOT="/opt/copilot"
INSTALL_DIR="${INSTALL_ROOT}/releases/${RUNTIME_VERSION}"
CURRENT_LINK="${INSTALL_ROOT}/current"
# A parked ticket's session must outlive the realm's questionTimeoutMs by a wide margin.
SESSION_IDLE_TIMEOUT="604800"
RELEASE_BASE="https://github.com/github/copilot-cli/releases/download/v${RUNTIME_VERSION}"

# Egress policy. The harness clones and pushes with its own git, so nothing it must reach — a
# mirror, a proxy, a model endpoint — may live inside these ranges.
GATEWAYS=("192.168.0.1" "192.168.8.1")
LAN_DENY=("192.168.0.0/24" "192.168.8.0/24")
RANGE_DENY=("10.0.0.0/8" "172.16.0.0/12")

if [[ $EUID -ne 0 ]]; then
   echo "❌ This script must be run as root (use sudo)."
   exit 1
fi

case "$(uname -m)" in
    x86_64|amd64) PLATFORM="linux-x64"; GH_ARCH="amd64" ;;
    aarch64|arm64) PLATFORM="linux-arm64"; GH_ARCH="arm64" ;;
    *) echo "❌ Unsupported architecture: $(uname -m)"; exit 1 ;;
esac

for bin in curl tar git openssl; do
    command -v "${bin}" >/dev/null || { echo "❌ '${bin}' is required and not installed."; exit 1; }
done

echo "🚀 Starting Blong Copilot runtime setup: ${RUNTIME_VERSION} for ${PLATFORM}"

# 1. Download, verify and unpack the runtime into a versioned directory, so an older one survives
#    a bad upgrade
echo "⬇️  Installing Microsoft Copilot runtime ${RUNTIME_VERSION}"
TARBALL="github-copilot-${RUNTIME_VERSION}-${PLATFORM}.tgz"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR:-}"' EXIT
curl -fsSL --retry 3 --retry-delay 2 -o "${TMP_DIR}/${TARBALL}" "${RELEASE_BASE}/${TARBALL}"
curl -fsSL --retry 3 --retry-delay 2 -o "${TMP_DIR}/SHA256SUMS.txt" "${RELEASE_BASE}/SHA256SUMS.txt"
( cd "${TMP_DIR}" && grep " ${TARBALL}\$" SHA256SUMS.txt | sha256sum --check --status ) ||
    { echo "❌ checksum mismatch for ${TARBALL}; nothing was replaced."; exit 1; }

STAGING="${INSTALL_ROOT}/releases/.staging-${RUNTIME_VERSION}"
rm -rf "${STAGING}"
mkdir -p "${STAGING}"
tar -xzf "${TMP_DIR}/${TARBALL}" -C "${STAGING}"
[[ -x "${STAGING}/package/prebuilds/${PLATFORM}/copilot-runtime" ]] ||
    { echo "❌ ${TARBALL} does not contain package/prebuilds/${PLATFORM}/copilot-runtime"; exit 1; }

rm -rf "${INSTALL_DIR}"
mv "${STAGING}" "${INSTALL_DIR}"
ln -sfn "releases/${RUNTIME_VERSION}" "${CURRENT_LINK}"
chmod -R a+rX "${INSTALL_ROOT}"

# 2. Dedicated user and isolated directories
if ! id "${SERVICE_USER}" &>/dev/null; then
    echo "👤 Creating dedicated '${SERVICE_USER}' user..."
    useradd -r -m -d "${BASE_DIR}" -s /bin/bash "${SERVICE_USER}"
fi
SERVICE_HOME="$(getent passwd "${SERVICE_USER}" | cut -d: -f6)"
[[ "${SERVICE_HOME}" == "${BASE_DIR}" ]] ||
    echo "⚠️  ${SERVICE_USER}'s home is ${SERVICE_HOME}; the worker writes under ${BASE_DIR} only."

echo "📁 Setting up workspace and state directories at ${BASE_DIR}..."
mkdir -p "${WORKSPACES_DIR}" "${STATE_DIR}"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${BASE_DIR}"
chmod 750 "${BASE_DIR}"
# Every ticket's transcript is written here.
chmod 700 "${STATE_DIR}"

# git identity and trust for the harness, which clones, commits and pushes as this user. The
# credential itself arrives in the next step: one token that `gh` and git both present.
sudo -H -u "${SERVICE_USER}" git config --global user.name "Blong Agent"
sudo -H -u "${SERVICE_USER}" git config --global user.email "blong.agent@feasible.one"
sudo -H -u "${SERVICE_USER}" git config --global init.defaultBranch main
sudo -H -u "${SERVICE_USER}" git config --global --add safe.directory "${WORKSPACES_DIR}"

# 3. GitHub access. The harness's bundled skills call `gh` for pull requests, issues, `gh api`
#    and CI, and git does the clone and the push, so one token serves both. gh resolves it from
#    GH_TOKEN, which the unit passes to the runtime and git's helper reads back when asked.
if ! command -v gh &>/dev/null; then
    echo "⬇️  Installing gh ${GH_VERSION}"
    GH_ASSET="gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz"
    curl -fsSL --retry 3 --retry-delay 2 -o "${TMP_DIR}/${GH_ASSET}" \
        "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${GH_ASSET}"
    curl -fsSL --retry 3 --retry-delay 2 -o "${TMP_DIR}/gh-checksums.txt" \
        "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_checksums.txt"
    ( cd "${TMP_DIR}" && grep " ${GH_ASSET}\$" gh-checksums.txt | sha256sum --check --status ) ||
        { echo "❌ checksum mismatch for ${GH_ASSET}"; exit 1; }
    tar -xzf "${TMP_DIR}/${GH_ASSET}" -C "${TMP_DIR}"
    install -m 755 "${TMP_DIR}/gh_${GH_VERSION}_linux_${GH_ARCH}/bin/gh" /usr/local/bin/gh
fi

EXISTING_GH_TOKEN=""
if [[ -f "${ENV_FILE}" ]]; then
    EXISTING_GH_TOKEN="$(sed -n 's/^GH_TOKEN=//p' "${ENV_FILE}" | tail -n 1)"
fi
GH_ACCESS_TOKEN="${GH_TOKEN:-${EXISTING_GH_TOKEN}}"

# git presents the token gh resolves from GH_TOKEN, and an SSH-shaped remote is rewritten to the
# HTTPS form that helper answers, so either URL a ticket names reaches the same credential.
sudo -H -u "${SERVICE_USER}" git config --global --replace-all \
    'credential.https://github.com.helper' ''
sudo -H -u "${SERVICE_USER}" git config --global --add \
    'credential.https://github.com.helper' '!gh auth git-credential'
sudo -H -u "${SERVICE_USER}" git config --global \
    'url.https://github.com/.insteadOf' 'git@github.com:'

if [[ -n "${GH_ACCESS_TOKEN}" ]]; then
    # An assignment before the command is its environment, not an argument, so the token stays
    # out of `ps`; gh prefers GH_TOKEN over anything it has stored.
    GH_LOGIN="$(GH_TOKEN="${GH_ACCESS_TOKEN}" gh api user --jq .login 2>/dev/null || true)"
    if [[ -z "${GH_LOGIN}" ]]; then
        echo "❌ GH_TOKEN does not work: expired, revoked, or never valid."
        exit 1
    fi
    if [[ -n "${GH_REPO}" ]]; then
        GH_PUSH="$(GH_TOKEN="${GH_ACCESS_TOKEN}" gh api "repos/${GH_REPO}" \
            --jq .permissions.push 2>/dev/null || true)"
        if [[ "${GH_PUSH}" != "true" ]]; then
            echo "❌ GH_TOKEN cannot push to ${GH_REPO}: it needs Contents read/write with that"
            echo "   repository selected, or it cannot see the repository at all."
            exit 1
        fi
        GH_TOKEN="${GH_ACCESS_TOKEN}" gh run list -R "${GH_REPO}" -L 1 >/dev/null 2>&1 ||
            { echo "❌ GH_TOKEN cannot read CI runs for ${GH_REPO}: Actions read is missing."; exit 1; }
    fi
    echo "🔑 GitHub access verified as ${GH_LOGIN}${GH_REPO:+ - push and CI read on ${GH_REPO}}"
else
    echo "⚠️  No GH_TOKEN passed: the agent cannot clone, push, open pull requests or read CI."
    echo "    Write GH_TOKEN into ${ENV_FILE} (root-only) and re-run; GH_REPO=owner/name adds"
    echo "    the push-rights and CI-read checks."
fi

# 4. Secrets and environment. An existing value survives a re-run: a regenerated token would
#    break every account that still presents the old one from the realm's Secret.
mkdir -p "$(dirname "${ENV_FILE}")"
chmod 750 "$(dirname "${ENV_FILE}")"
EXISTING_TOKEN=""
EXISTING_PROVIDER_KEY=""
if [[ -f "${ENV_FILE}" ]]; then
    EXISTING_TOKEN="$(sed -n 's/^COPILOT_CONNECTION_TOKEN=//p' "${ENV_FILE}" | tail -n 1)"
    EXISTING_PROVIDER_KEY="$(sed -n 's/^COPILOT_PROVIDER_API_KEY=//p' "${ENV_FILE}" | tail -n 1)"
fi
CONNECTION_TOKEN="${CONNECTION_TOKEN_ARG:-${EXISTING_TOKEN:-$(openssl rand -hex 32)}}"
PROVIDER_KEY="${PROVIDER_API_KEY:-${EXISTING_PROVIDER_KEY}}"

# The key is proved against the provider's own model list: it costs no tokens, and being listed
# is the answer a session's first turn depends on. The header is read from curl's stdin, so the
# key never reaches an argument list either.
if [[ -n "${PROVIDER_KEY}" ]]; then
    PROVIDER_STATUS="$(printf 'header = "Authorization: Bearer %s"\n' "${PROVIDER_KEY}" |
        curl -K - -sS -o "${TMP_DIR}/provider-models.json" -w '%{http_code}' --max-time 20 \
            "${PROVIDER_BASE_URL%/}/models" || echo 000)"
    PROVIDER_PROBLEM=""
    case "${PROVIDER_STATUS}" in
        200) ;;
        401|403) PROVIDER_PROBLEM="the provider rejected the key (HTTP ${PROVIDER_STATUS})" ;;
        404) PROVIDER_PROBLEM="${PROVIDER_BASE_URL} has no model list (HTTP 404)" ;;
        # a failed transfer still prints its own 000, and the fallback appends another
        000|000*) PROVIDER_PROBLEM="${PROVIDER_BASE_URL} did not answer" ;;
        *) PROVIDER_PROBLEM="the provider answered HTTP ${PROVIDER_STATUS}" ;;
    esac
    if [[ -z "${PROVIDER_PROBLEM}" ]]; then
        PROVIDER_STATE="stored and verified against ${PROVIDER_BASE_URL}"
        echo "🔑 Provider key verified against ${PROVIDER_BASE_URL}"
        grep -q "\"${PROVIDER_MODEL}\"" "${TMP_DIR}/provider-models.json" ||
            echo "⚠️  ${PROVIDER_MODEL} is not in that list; the account's modelName must be served."
    elif [[ -n "${PROVIDER_API_KEY}" ]]; then
        echo "❌ COPILOT_PROVIDER_API_KEY does not work: ${PROVIDER_PROBLEM}."
        exit 1
    else
        PROVIDER_STATE="stored, unverified (${PROVIDER_PROBLEM})"
        echo "⚠️  The provider key kept from ${ENV_FILE} does not work: ${PROVIDER_PROBLEM}."
        echo "    A realm session sends its own key, so tickets still run; pass a new one to replace it."
    fi
fi

{
    echo "# Written by copilot-runtime.sh. Root-only; holds the connection and GitHub tokens."
    echo "HOME=${SERVICE_HOME}"
    echo "COPILOT_HOME=${STATE_DIR}"
    echo "COPILOT_CONNECTION_TOKEN=${CONNECTION_TOKEN}"
    if [[ -n "${PROVIDER_KEY}" ]]; then
        echo "COPILOT_PROVIDER_API_KEY=${PROVIDER_KEY}"
    fi
    if [[ -n "${GH_ACCESS_TOKEN}" ]]; then
        echo "GH_TOKEN=${GH_ACCESS_TOKEN}"
    fi
    # A clone without a credential fails at once instead of hanging the ticket on a prompt.
    echo "GIT_TERMINAL_PROMPT=0"
} > "${ENV_FILE}"
chown root:root "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

# 5. systemd unit. The secrets stay in the environment file: a unit-level Environment= is
#    readable through systemd's own properties, an EnvironmentFile is not.
echo "⚙️  Writing systemd service unit to ${SERVICE_FILE}..."
cat <<EOF > "${SERVICE_FILE}"
[Unit]
Description=Copilot runtime for blong-agent
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${WORKSPACES_DIR}
EnvironmentFile=${ENV_FILE}
ExecStartPre=/usr/bin/test -d ${WORKSPACES_DIR}
ExecStart=${CURRENT_LINK}/package/prebuilds/${PLATFORM}/copilot-runtime --server --host 0.0.0.0 --port ${PORT} --session-idle-timeout ${SESSION_IDLE_TIMEOUT}
Restart=always
RestartSec=5
TimeoutStopSec=60
UMask=0077
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF

# 6. Enable and restart. `enable --now` leaves an already-running worker on the old binary, and
#    an unchanged token, so an upgrade would silently keep serving the previous version.
echo "🔄 Enabling and restarting ${SERVICE_NAME}..."
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

# 7. Firewall. The connection is plaintext and carries the model key as well as the token, so the
#    port names its callers and the egress rules must not cut the host off from what it clones.
if [[ -n "${ORCHESTRATOR_IP}" ]]; then
    echo "🛡️  Restricting port ${PORT} to ${ORCHESTRATOR_IP} via UFW..."
    if ! command -v ufw &>/dev/null; then
        echo "⚠️  ufw is not installed; port ${PORT} is open on every interface."
    else
        ufw allow from "${ORCHESTRATOR_IP}" to any port "${PORT}" proto tcp
        # SSH stays open before anything else is tightened
        ufw allow "${SSH_PORT}"/tcp

        for gw in "${GATEWAYS[@]}"; do
            ufw allow out to "${gw}" port 53 proto udp
            ufw deny out to "${gw}" port 22,23,80,443 proto tcp
        done
        for net in "${LAN_DENY[@]}" "${RANGE_DENY[@]}"; do
            ufw deny out to "${net}"
        done

        ufw --force enable
    fi
else
    echo "⚠️  No orchestrator IP passed. Remember to restrict port ${PORT} manually!"
fi

# 8. Prove the worker answers before claiming it is ready, then say what the realm must be told
SERVER_IPS="$(hostname -I 2>/dev/null | xargs || true)"
PRIMARY_IP="${SERVER_IPS%% *}"
[[ -n "${PRIMARY_IP}" ]] || PRIMARY_IP="127.0.0.1"

if ! systemctl is-active --quiet "${SERVICE_NAME}"; then
    echo "❌ ${SERVICE_NAME} is not running: journalctl -u ${SERVICE_NAME} -n 50"
    exit 1
fi
if ! timeout 3 bash -c ": >/dev/tcp/127.0.0.1/${PORT}" 2>/dev/null; then
    echo "❌ ${SERVICE_NAME} runs but ${PORT} does not answer: journalctl -u ${SERVICE_NAME} -n 50"
    exit 1
fi

GH_STATE="not set - the agent cannot reach GitHub"
if [[ -n "${GH_ACCESS_TOKEN}" ]]; then
    GH_STATE="verified as ${GH_LOGIN}${GH_REPO:+ - push and CI read on ${GH_REPO}}"
fi

echo ""
echo "=============================================================================="
echo "✅ Blong Copilot runtime ready"
echo "=============================================================================="
echo "Runtime:          ${RUNTIME_VERSION} (${PLATFORM})"
for ip in ${SERVER_IPS}; do
    echo "Worker URI:       http://${ip}:${PORT}"
done
echo "Workspaces Path:  ${WORKSPACES_DIR}"
echo "State Path:       ${STATE_DIR}"
echo "Environment file: ${ENV_FILE} (root only)"
echo "Provider key:     ${PROVIDER_STATE}"
echo "GitHub access:    ${GH_STATE}"
if [[ -z "${CONNECTION_TOKEN_ARG}" && -z "${EXISTING_TOKEN}" ]]; then
    echo "Connection token: ${CONNECTION_TOKEN}"
    echo "                  (shown once; it also sits in ${ENV_FILE})"
fi
echo ""
echo "Logs:             journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "The realm registers this host as an account of its own — one per runtime, because a session"
echo "lives in the runtime that holds it:"
echo ""
echo "    copilot:"
echo "      srv1:"
echo "        kind: copilot"
echo "        runtimeUrl: ${PRIMARY_IP}:${PORT}"
echo "        runtimeTokenEnv: COPILOT_CONNECTION_TOKEN"
echo "        workspaceRoot: ${WORKSPACES_DIR}"
echo "        modelName: deepseek-flash"
echo "        baseUrl: https://api.deepseek.com/v1"
echo "        apiKeyEnv: AGENT_ENGINE_API_KEY"
echo ""
echo "Copy the token out of ${ENV_FILE} into the realm's Secret, then check the pairing with:"
echo "    blong-dev call engine.account.check --account srv1"
echo ""
echo "The agent's GitHub token needs Contents, Pull requests and Issues read/write plus Checks and"
echo "Actions read, on the repositories this worker serves."
echo "=============================================================================="
