# Memory files

Why the repository keeps its working notes — the frictions, todos and decisions of an implementation
— as files the repository itself validates, rather than as prose documents or an external tracker.

## The problem

The notes were three flat documents: one list of bullets each, growing without structure. Nothing in
them was addressable: a decision could only be referred to as "decision.md L1153", so every edit
above it invalidated the reference, and every reader who wanted to find a note read the whole file.
Two notes about the same realm sat a thousand lines apart, and the file that grew fastest — the
friction list — was the one nobody could bear to read.

## The approach

Markdown, in the repository, with enough structure for a machine to navigate:

- **One entry per finding**, with a title someone can search for and a body that stands alone.
- **A stable id** per entry, so an entry can cite another by name and survive any edit (`F-014`).
- **A date, an area and a status** on every entry, so the files can be filtered, split and audited.
- **A package split**: a package's own notes live with the package, the root keeps what is
  cross-cutting. Reading a package's memory is reading its own history.
- **A generated index** at the top of every file — one line per entry, grouped by status — so an
  agent (or a person) can orient in about forty lines instead of opening the whole file.
- **Writes only through the CLI.** The format, the ids, the wrapping and the index are the command's
  business, which is what keeps a hand-edited file from drifting away from the rules the checks
  enforce.

## Trade-offs

- **No database, no service.** The notes live and die with the branch they describe: reviewing a
  pull request shows the friction that produced it. The cost is that the format has to be
  hand-rolled — hence `memory check`, and a lint rule set that keeps the markdown itself clean.
- **A CLI between the author and the file.** It is what makes ids and indexes trustworthy, and it is
  also why adding a note is a command rather than an edit. `memory import` exists so a large batch —
  a migration, or an agent's work — can be authored as JSON and written by the same code path.
- **Nothing is deleted silently.** The CLI removes entries only on `memory prune` with a reason, and
  `memory audit` reports the leftovers of edits: references to ids that no longer exist, two entries
  with the same title, entries that have been open for months.

## Why the index over the notes is disposable

Free-text search over the notes matches strings. An agent that has the _question_ — "what did we
learn about coverage aggregation?" — but not the vocabulary the entry used (`F-160` says "the batch
files cannot be used as the coverage map") has two options: grep for words it is guessing at, or
read the tree. Both waste the thing the notes exist to save.

The notes are therefore also indexed by meaning, in a local memory service that answers a question
with the entries closest to it. Each entry is one document keyed by its id, so re-ingesting a
corrected entry replaces it; the dimensions a search filters on (kind, area, status, path) travel as
tags, because tags are the only thing the service can filter on.

The index is deliberately _not_ a second source of truth. Three consequences follow, and they are
the reason for the design rather than accidents of it:

- **A write never depends on it.** The file is written first and the index is told afterwards, with
  a bounded timeout; an unreachable service costs one warning, not a lost entry. A note that fails
  to save is a lost finding, while an index that misses one is a re-run of the backfill.
- **It is rebuilt, not repaired.** Entries are keyed by id, so ingestion is an upsert: the backfill
  can be run over everything at any time, and the cheap way to recover from any doubt is to run it
  again.
- **It holds the entry, not a summary of it.** The bank runs in `chunks` mode, so ingestion calls no
  model at all and a search returns the text that is in the file — the note as its author wrote it,
  not a paraphrase produced by whichever model happened to be configured.

## Design principles

1. The file is the source of truth; the index is derived and regenerated.
2. An entry records the _reasoning_, not just the outcome — a decision without its why is a rumour.
3. The user's own todo list is theirs: it lives in a `## Manual` section no agent edits.
4. Everything the format promises is checked by a command, so the promise survives without anyone
   remembering it.
