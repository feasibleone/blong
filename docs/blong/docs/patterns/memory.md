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

## Reading them

```bash
blong-dev memory list --kind friction --area core/blong-browser --status open
blong-dev memory list --search "connection pool" --json     # agents use --json
blong-dev memory show F-014 --json
blong-dev memory audit                                      # dangling references, duplicate titles, stale entries
```

Start with the index block at the top of a file: it lists every entry once, grouped by status. Only
read further when an entry looks relevant — that is the whole point of the index.

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

`check` is the gate: it is wired into the pre-commit hook for staged memory files and runs in CI, so
it also reports the markdown a hand-written body would break — a section heading in the middle of a
body, a line over 100 columns, `<placeholder>` HTML, emphasis on a line of its own, a list or fence
without a blank line around it. `blong-dev lint --files …` covers the same ground for any markdown
file plus cspell, and is the command to run when you have touched a `.md` file outside the memory
tree.
