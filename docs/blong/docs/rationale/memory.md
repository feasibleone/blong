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

## Design principles

1. The file is the source of truth; the index is derived and regenerated.
2. An entry records the _reasoning_, not just the outcome — a decision without its why is a rumour.
3. The user's own todo list is theirs: it lives in a `## Manual` section no agent edits.
4. Everything the format promises is checked by a command, so the promise survives without anyone
   remembering it.
