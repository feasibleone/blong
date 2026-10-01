# Embedding model comparison

The semantic index can embed with the image's built-in model or with one the LAN Ollama host serves.
This is the measurement that decided which one `plans/memory-index/hindsight.sh` starts, so that the
choice was not made on a feeling about "bigger is better" (decision D-336).

## Candidates

| Model                    | Where it runs    | Width | Alias in the script             |
| ------------------------ | ---------------- | ----: | ------------------------------- |
| `BAAI/bge-small-en-v1.5` | in-container CPU |   384 | `EMBED_MODEL=local`             |
| `nomic-embed-text`       | Ollama, over LAN |   768 | `EMBED_MODEL=nomic-embed-text`  |
| `mxbai-embed-large`      | Ollama, over LAN |  1024 | `EMBED_MODEL=mxbai-embed-large` |

The embedding model is a server-level setting, so each candidate needs a recreated container with a
wiped volume, the bank's own config re-applied, and a full backfill — all three then face the same
591 entries (the tree held 591 entries at the time; it has grown since).
`plans/memory-index/hindsight.sh` takes the model as `EMBED_MODEL`; `local` is the absence of an
embeddings provider rather than a name, because that is what makes the image use its built-in model.

The model really did change in each run, and not only in the log. With the volume wiped the database
recreates its vector column from the configured model, so the stored width identifies the model that
wrote the data: read straight out of `memory_units.embedding` after storing a single document,
`EMBED_MODEL=local` produced `vector(384)`, `nomic-embed-text` `vector(768)` and `mxbai-embed-large`
`vector(1024)`, each with 0 failed operations. That is also what makes this the irreversible choice
it is — the width is fixed by the first write, and adopting another model means wiping the bank. A
behavioural cross-check agrees: with reranking off, 24 of the 36 queries changed rank between
models, which can only come from the vectors, since the same text and the same keyword arm fed every
run.

## Method

`eval/queries.json` holds 36 queries over the entry bodies, each with the id it should retrieve: 32
_paraphrase_ queries that describe an entry's situation in words the entry does not use, so the
semantic arm is what has to find it, and 4 _lexical_ controls that quote a distinctive phrase and
should be found by the keyword arm whatever the model is. The queries were authored by reading the
entry bodies, not from their titles.

`eval/run.mjs` recalls each query, ranks the result list by document (a result list is deduped by
`document_id`, so chunking — identical for every model — cannot give one entry several chances), and
reports hit@1/@3/@5/@10, MRR and mean latency. Each model is measured twice: once as the bank is
configured for use, and once with `enable_reranking: false`, which isolates the embedding arm from
the cross-encoder at no extra indexing cost.

## Results

With reranking — the configured behaviour:

| Model | hit@1 | hit@3 | hit@5 | hit@10 |  MRR |  latency |
| ----- | ----: | ----: | ----: | -----: | ---: | -------: |
| local |   92% |   92% |   97% |    97% | .929 | 7 637 ms |
| nomic |   92% |   92% |   97% |    97% | .929 | 7 899 ms |
| mxbai |   92% |   92% |   97% |    97% | .929 | 7 673 ms |

Identical — and not merely equal on the averages: every one of the 36 queries landed at the
_identical rank_ under all three models, including the two that were retrieved below first place
(`D-001` at 4, `F-197` at 5) and the one that was not retrieved at all. That single miss is a
labelling error rather than a retrieval failure: the query asked which realm answers
`portalConfigGet`, and all three models returned `F-193`, `D-210` and `D-326` — the entries about
portal-configuration conflicts, which is what the question describes.

With reranking disabled, the embedding model is the only variable left:

| Model | hit@1 | hit@3 | hit@5 | hit@10 |  MRR | latency |
| ----- | ----: | ----: | ----: | -----: | ---: | ------: |
| local |   42% |   56% |   78% |    94% | .554 |   66 ms |
| nomic |   39% |   67% |   78% |    97% | .555 |   89 ms |
| mxbai |   44% |   56% |   72% |    94% | .560 |   77 ms |

The spread is five points of hit@1 — two queries of 36 — and .006 of MRR, in no consistent
direction: `mxbai` wins hit@1, `nomic` wins hit@3, `local` is the fastest and the only one with a
miss. This is noise, and it is noise in the arm that is not used.

36 queries resolve differences of roughly ten points at best (the 95% interval on 90% is ±10), so
this benchmark can rule out a large benefit and cannot rule out a small one. The stronger evidence
is the identical-rank result above rather than the aggregate percentages.

Backfill of all 591 entries: local 36 s, both Ollama models 25 s, with 0 failed operations. The
local model is not slower in any way that matters.

## Decision

Keep the built-in `local` model. A stronger embedding model changes nothing a user can observe while
the reranker runs, and buys nothing measurable when it does not — against three real costs: a LAN
host that must be up, an embeddings configuration whose key names carry the provider segment so a
drift silently falls back to OpenAI's `text-embedding-3-small` against the wrong host, and 2–2.7×
the vector width. Ollama remains reachable through `EMBED_MODEL` for anyone who wants to re-measure.

## What the measurement found instead

The reranker, not the embedding model, is what makes retrieval good — and what makes it slow: 92%
against 42% hit@1 at 7.5 s against 66 ms per query. A `local` + reranking search answers in about
seven seconds at 591 entries, and that grows with the corpus. The trade-off is recorded in D-337;
this comparison deliberately does not change it.
