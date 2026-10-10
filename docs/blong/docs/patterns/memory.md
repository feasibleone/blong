# Memory files

How to add, correct, find and verify the repository's frictions, todos and decisions. For what they
are, see the [concept overview](../concepts/memory).

## Where the files live

| Scope                                        | Path                                              |
| -------------------------------------------- | ------------------------------------------------- |
| Root (cross-cutting, `ci`, `docs`, `skills`) | `<repo>/.github/memory/<kind>.md`                 |
| Package                                      | `<repo>/<projectFolder>/.github/memory/<kind>.md` |

`<kind>` is `friction`, `todo` or `decision`. A package file starts with the entries that belong to
that package; anything cross-cutting belongs in the root file, and `memory check` warns when a root
file holds a package entry.

## The shape of an entry

```markdown
### F-014 — A nested `tap` run ignores `--reporter=json`

> _2026-09-15 · ci · resolved_

The nested tap inherited `TAP_CHILD_ID`, concluded it was a child job and reported zero tests. Unset
the `TAP_*` variables before spawning the inner run.
```

- `F-`/`T-`/`D-` plus a number, allocated workspace-wide and never reused.
- The title is one line, at most 80 characters, and reads on its own.
- The line under it — a blockquote, so markdownlint does not read it as a heading — carries the
  date, the area and the status, and is what `list --area` and `list --status` filter on.
- The body is wrapped at 100 columns by the CLI; paragraphs are separated by a blank line. A fenced
  code block is passed through untouched and needs a language (` ```bash `).

The generated index sits between `<!-- memory:index -->` and `<!-- /memory:index -->`. It is
derived: the CLI writes it, and `check` fails when it drifts from the entries.

## Adding and correcting entries

```bash
blong-dev memory add friction --area core/blong-gogo --title "…" --body "…"
blong-dev memory add todo --area cross-cutting --title "…" --body-file body.md
blong-dev memory edit F-014 --body-file body.md                       # correct one (never hand-edit)
blong-dev memory close F-014 --note "fixed in b1f3c9a"                # resolved / done / superseded
blong-dev memory close D-018 --by D-042 --reason "the union is no longer debounced"
blong-dev memory reopen F-014                                          # it came back
blong-dev memory move F-014 --area core/semantic-log                    # it belongs elsewhere
blong-dev memory prune F-101,F-102 --reason "duplicated by F-090"
```

`add` refuses a title longer than 80 characters and refuses an area that is neither a package folder
nor a reserved label. For a long body use `--body-file`; `--date` and `--status` override the
defaults (today, and the first status of the kind).

`close` treats the three kinds differently, because their ids mean different things. A friction and
a decision keep their entry — under `Resolved` and `Superseded`, still searchable, the resolution or
the successor named in the body — because the lesson outlives the status and the id is never reused.
A todo is _removed_ from the file and its document is deleted from the index: the work is done and
the record of it is the commit. `--keep` writes it to `## Done` instead, which keeps it findable at
the cost of a file that grows forever.

## Reading them

```bash
blong-dev memory list --kind friction --area core/blong-browser --status open
blong-dev memory list --search "connection pool" --json     # agents use --json
blong-dev memory show F-014 --json
blong-dev memory audit                                      # dangling references, duplicate titles, stale entries
```

Start with the index block at the top of a file: it lists every entry once, grouped by status. Only
read further when an entry looks relevant — that is the whole point of the index.

`list --search` matches the text of an entry. It is always available, it is exact, and it needs
nothing running — when you know a word the entry uses, it is the shortest path. When you know only
the _meaning_, use the [semantic search](#searching-by-meaning) below.

## Searching by meaning

`search` asks a local Hindsight server which entries are close to a question, so a paraphrase finds
the entry that uses different words.

```bash
blong-dev memory search "why do agents keep editing memory files by hand"
blong-dev memory search "coverage thresholds" --kind friction --area core/blong-browser --limit 5
blong-dev memory search "the union is no longer debounced" --json
blong-dev memory search "how do the notes work" --source docs
blong-dev memory search "handler naming" --source entry,docs   # both streams in one query
```

`--source` selects the stream: `entry` (the default), `docs` or `skill`, comma-joined for several. A
search defaults to the entries, so adding the documentation to the bank never changed what an
existing query returns. `--kind`, `--area` and `--status` describe entries only, so asking for them
beside a page source is refused rather than answered with nothing.

Each hit prints a rule, the entry's id, kind, status and similarity, the file it lives in, and the
entry text as it stands in that file. The number is the cosine similarity of the embedding. The
server also reports a ranking score, but it is not comparable between queries — a relevant match can
rank first at `0.0006` — so it is carried in `--json` rather than shown.

Treat an empty result as "nothing close", not as "not written down", and fall back to
`list --search` — the two read the same tree, one by text and one by meaning.

### What the index holds, and when

Every entry is one document, keyed by its id, so re-ingesting an edited entry replaces it rather
than duplicating it. The dimensions a search can filter on — kind, area, status, id, file path — are
written as tags, and mirrored into the document's metadata for the server's own UI.

The bank holds three streams, told apart by a tag rather than by a second bank, so one query can
span them:

| Stream  | What it is                                                   | Id                     | Tags                                   |
| ------- | ------------------------------------------------------------ | ---------------------- | -------------------------------------- |
| `entry` | one document per memory entry                                | the entry id (`F-316`) | `memory`, `kind:`, `area:`, `status:`  |
| `docs`  | one document per published page in `docs/blong/docs/<tier>/` | `doc-<tier>-<name>`    | `kind:documentation`, `tier:`, `path:` |
| `skill` | one document per `.github/skills/*/SKILL.md`                 | `skill-<name>`         | `kind:agent-skill`, `scope:`, `path:`  |

A page or a skill is stable state rather than an event, so its id comes from its path: an edit
replaces the document instead of adding a second fragment, which is what makes re-ingesting a whole
tier cheap and safe. `--sources docs,skill` ingests them; the default is `entry`, so nothing about
an existing query changes.

An agent that wants Hindsight's own documentation as a skill can pull it in beside the local ones
(Blong discovers skills from `.github/skills/*/SKILL.md` and has no installer of its own):

```bash
npx skills add https://github.com/vectorize-io/hindsight --skill hindsight-docs
```

The index is **derived**: the markdown is the source of truth, and the bank can be dropped and
rebuilt at any time.

| Command                                  | What it does to the index                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `add`, `edit`, `close`, `reopen`, `move` | Queues the entries the command touched (one call, not one per entry).                         |
| `prune`                                  | Deletes the pruned entries' documents, so a search cannot find what the tree no longer holds. |
| `index --semantic`                       | Ingests every entry of the selected files — the first fill, and the repair.                   |
| `index --semantic --dry-run`             | Reports how many entries would be ingested, without touching the server.                      |
| `index --semantic --stats`               | Also compares the bank with the tree and names what drifted.                                  |
| `index --semantic --prune`               | Deletes the bank documents the tree no longer holds.                                          |

A write never fails because of the index: if the server is unreachable, the command prints one
warning on stderr and the entry is written anyway. The backfill is the repair for whatever was
skipped, and re-running it is safe.

```bash
blong-dev memory index --semantic                        # every file
blong-dev memory index --semantic --files .github/memory/friction.md
blong-dev memory index --semantic --dry-run              # count only
blong-dev memory index --semantic --sources docs,skill   # the docs site and the skills
blong-dev memory index --semantic --stats                # what the bank holds, and what drifted
blong-dev memory index --semantic --prune                # drop what the tree no longer holds
```

### Pointing the CLI at a server

| Setting              | Default                 | Meaning                                                                |
| -------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `HINDSIGHT_API_URL`  | `http://localhost:8888` | The server; `.blong_devrc` may hold it as `hindsight.url`.             |
| `HINDSIGHT_BANK`     | `blong`                 | Which bank to read and write; `.blong_devrc` `hindsight.bank`.         |
| `HINDSIGHT_DISABLED` | unset                   | `1`, `true`, `on` or `yes` turns the feature off, write hook included. |

The server is deployed by `plans/memory-index/hindsight.sh`, which carries the two settings that
cannot be changed later without wiping the bank: the embedding model, and therefore the vector
width, and the bank's `retain_extraction_mode: chunks` — entries are stored verbatim and ingestion
calls no LLM at all.

The embedding model is the built-in `BAAI/bge-small-en-v1.5` on purpose. Measured over the whole
tree, it and two Ollama models three times its width rank every benchmark query identically while
the cross-encoder reranker runs, and differ by noise without it — so a bigger model buys nothing
observable against a LAN dependency. `EMBED_MODEL` on the script still selects an Ollama model for
anyone re-measuring; the numbers are in `plans/memory-index/embedding-model-comparison.md`.

One bank means one embedding model for everything in it: the entries, the documentation pages and
the skills are chunked and embedded by the same settings, so a query compares them on equal terms.
The width is fixed by the first write, which is why the model is chosen once, at the script.

## Writing a batch (migration, or an agent's work)

A batch is JSON, authored outside the CLI and written by it:

```json
{
    "kind": "friction",
    "entries": [
        {
            "title": "A stale line range spliced items into the index block",
            "body": "Sections are line ranges; a refresh moves them. Re-read the structure after any refresh.",
            "area": "tools/blong-dev",
            "status": "resolved",
            "date": "2026-09-15"
        }
    ]
}
```

```bash
blong-dev memory import batch.json            # dry run: what would be written, and what is refused
blong-dev memory import batch.json --apply    # write it
```

Import validates the whole batch before writing anything: a bad title, an unknown area, a status the
kind does not have, an entry that is already in the tree (same title and body) or one that repeats
earlier in the batch are all reported and nothing is written. `--force` overrides the duplicate
check, and is almost never what you want — importing a batch twice duplicates every entry it holds.

## The user's own list

The `## Manual` section of the root todo is the user's: it is never indexed, never rewritten, and
never touched by an agent.

```bash
blong-dev memory manual list
blong-dev memory manual add "the thing I keep meaning to do"
blong-dev memory manual done 3
```

## Before you finish

```bash
blong-dev memory check                  # format, ids, areas, index, statuses, markdown rules
blong-dev memory check --files a.md,b.md
blong-dev memory format                 # re-wrap and re-render everything the CLI owns
blong-dev memory index                  # regenerate the index blocks only
```

`check` is the gate: `common/git-hooks/pre-commit` runs `blong-dev lint-staged`, which detects the
staged files under `.github/memory/` and checks them, so a malformed entry fails your commit rather
than a review comment. (The CI workflow delegates to a reusable Rush workflow and does not run this
itself, so the hook is the gate a contributor actually meets.) It also reports the markdown a
hand-written body would break — a section heading in the middle of a body, a line over 100 columns,
`<placeholder>` HTML, emphasis on a line of its own, a list or fence without a blank line around it.
`blong-dev lint --files …` covers the same ground for any markdown file plus cspell, and is the
command to run when you have touched a `.md` file outside the memory tree.
