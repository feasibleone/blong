#!/usr/bin/env bash
#
# The Hindsight memory server behind `blong-dev memory search`.
#
# The markdown tree is the source of truth and the bank is a derived index, so this
# can be deleted and rebuilt at any time with `blong-dev memory index --semantic`.
# The bank holds three streams — the memory entries, the documentation pages and the
# agent skills — and they are embedded by the same settings, which is why the model is
# chosen here, once, rather than per query.
#
# Nothing is baked in: the Ollama host, the model names, the ports and the volume all
# take an environment override, so the same script runs against a local Ollama, a LAN
# host, or with no Ollama at all. The defaults assume a local Ollama and the built-in
# embedding model — the configuration the numbers below were measured with.
#
# `EMBED_MODEL` selects the embedding model: `local` (the image's built-in
# `BAAI/bge-small-en-v1.5`, 384 wide, no Ollama involved) or any embedding model the
# Ollama host serves (`nomic-embed-text` 768, `mxbai-embed-large` 1024). It is measured
# against the same corpus by `plans/memory-index/eval/`; see
# `plans/memory-index/embedding-model-comparison.md` for the numbers that decided it.
#
# Measured on the 591 entries the tree held at the time: the three candidates rank every
# benchmark query identically while the reranker runs, so the built-in `local` model is
# the default on purpose (D-336).
#
# Two things to know before changing the embedding model:
#
#   * Hindsight has no `ollama` embeddings provider. Ollama is reached through its
#     OpenAI-compatible endpoint, which is why the settings below are named
#     `..._EMBEDDINGS_OPENAI_*`. The key name carries the provider segment — a misnamed
#     key is silently ignored and the server falls back to OpenAI's
#     `text-embedding-3-small` against the wrong host.
#   * The embedding width is fixed once data exists: `nomic-embed-text` is 768,
#     `mxbai-embed-large` is 1024. Switching model (or back to the built-in `local`
#     default, 384) requires wiping the documents and re-running the backfill.
#
# `LLM_MODEL` is configured for the LLM lanes, but the bank runs
# `retain_extraction_mode: chunks`, so ingestion calls no LLM at all and recall returns
# entries verbatim rather than LLM-rewritten facts. Point the LLM at a stronger model
# before switching a bank to extraction.
#
# Usage:
#   plans/memory-index/hindsight.sh                                 # local defaults
#   EMBED_MODEL=nomic-embed-text plans/memory-index/hindsight.sh    # a wider model
#   OLLAMA=http://192.168.8.212:11434 plans/memory-index/hindsight.sh
#
# Environment:
#   RUNTIME       container runtime (default: podman; docker works)
#   CONTAINER     container name (default: hindsight)
#   VOLUME        state volume (default: hindsight-data)
#   PORT          API port (default: 8888) — what HINDSIGHT_API_URL points at
#   DEBUG_PORT    debug port (default: 9999)
#   BANK          bank to configure (default: blong; HINDSIGHT_BANK on the CLI)
#   BANK_CONFIG   0 to skip applying the bank's own settings
#   OLLAMA        Ollama base URL (default: http://localhost:11434)
#   LLM_MODEL     model for the LLM lanes (default: llama3.2:3b)
#   EMBED_MODEL   `local` for the built-in model, else an Ollama embedding model

set -euo pipefail

RUNTIME=${RUNTIME:-podman}
CONTAINER=${CONTAINER:-hindsight}
VOLUME=${VOLUME:-hindsight-data}
PORT=${PORT:-8888}
DEBUG_PORT=${DEBUG_PORT:-9999}
BANK=${BANK:-blong}
OLLAMA=${OLLAMA:-http://localhost:11434}
LLM_MODEL=${LLM_MODEL:-llama3.2:3b}
EMBED_MODEL=${EMBED_MODEL:-local}

# `local` needs no settings at all: leaving the provider unset is what makes the image
# use its built-in model, and setting the provider name explicitly is the one spelling
# that could be wrong on a given image version.
EMBED_ENV=()
if [[ "$EMBED_MODEL" != local ]]; then
  EMBED_ENV=(
    -e HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
    -e HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL="$OLLAMA/v1"
    -e HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL="$EMBED_MODEL"
    -e HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY=ollama
  )
fi

# `-d` without `-t`: this is a server. An interactive terminal is not just unnecessary,
# it makes the container refuse to start from a script or a CI job.
"$RUNTIME" run -d --pull always --name "$CONTAINER" --restart unless-stopped \
  -p "$PORT:8888" -p "$DEBUG_PORT:9999" \
  -e HINDSIGHT_API_LLM_PROVIDER=ollama \
  -e HINDSIGHT_API_LLM_BASE_URL="$OLLAMA/v1" \
  -e HINDSIGHT_API_LLM_MODEL="$LLM_MODEL" \
  -e OLLAMA_HOST="$OLLAMA" \
  "${EMBED_ENV[@]}" \
  -v "$VOLUME:/home/hindsight/.pg0" \
  ghcr.io/vectorize-io/hindsight:latest

# The bank's own settings are per-bank, not per-container, and they are the ones that
# decide whether ingestion calls an LLM at all. They are applied here rather than left
# as an instruction in a comment, so a fresh bank comes up the way the index expects.
# The call is idempotent: re-applying the settings a bank already has changes nothing.
#
# `enable_reranking` is on deliberately and is what makes the embedding model
# irrelevant — the cross-encoder reorders every candidate, so the built-in model and the
# two Ollama models return the same ranking. It is also the whole latency budget: about
# 7.5 s per query at 591 entries, against 66 ms with it off (D-337).
if [[ "${BANK_CONFIG:-1}" != 0 ]]; then
  printf 'waiting for http://localhost:%s ...\n' "$PORT"
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "http://localhost:$PORT/v1/default/banks/$BANK/config"; then
      break
    fi
    sleep 1
  done
  curl -fsS -X PUT "http://localhost:$PORT/v1/default/banks/$BANK" \
    -H 'content-type: application/json' \
    -d '{"retain_extraction_mode":"chunks","enable_observations":false,
         "enable_temporal_retrieval":false,"enable_graph_retrieval":false,
         "enable_text_search":true,"enable_reranking":true}'
  printf '\nbank %s configured\n' "$BANK"
fi

cat <<EOF

The server is up. Point the CLI at it with:
  HINDSIGHT_API_URL=http://localhost:$PORT blong-dev memory index --semantic
  HINDSIGHT_API_URL=http://localhost:$PORT blong-dev memory search "<question>"

Ingest everything, then check what the bank holds:
  blong-dev memory index --semantic --sources entry,docs,skill --stats

Logs:    $RUNTIME logs -f $CONTAINER
Remove:  $RUNTIME rm -f $CONTAINER && $RUNTIME volume rm $VOLUME

Models must exist on the Ollama host first:
  ollama pull nomic-embed-text
  ollama pull mxbai-embed-large     # an alternative, needs a wipe to adopt
  ollama pull $LLM_MODEL

If HTTP_PROXY/HTTPS_PROXY are set, add \$OLLAMA to NO_PROXY: nothing, not even
localhost, is exempted automatically.
EOF
