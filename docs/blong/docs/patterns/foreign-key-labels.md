# Foreign key columns and their labels

A table cell holds what the record holds. For a foreign key that is a key — a base64 resource id
that identifies a sport, an edition, an athlete — and a key is not what a reader wants. This page is
how a column shows the name instead, without the browser looking anything up.

See [Model System](../concepts/blong-model.md) for the model spec itself, and
[DB Schema Management](./schema-sync.md) for the table definitions the join reads.

---

## The column names its label

```typescript
// realm/blong-sport/meta/model/sportCompetitionModel.ts
sportId: {
    title: 'Sport',
    required: true,
    widget: {dropdown: 'sport.sport', body: 'sportName'},
},
```

Three things follow from that one line:

- **`body` is what is rendered.** The cell shows `sportName`; the key stays what the table reads,
  filters, edits and saves, and what the form submits.
- **The list read asks for it.** A table sends the label fields its columns declare as `labels` with
  the read, and the adapter adds a `LEFT JOIN` per label to that same statement. No second query, no
  per-cell lookup, nothing cached in the browser.
- **The name is derived, not trusted.** `labels` may only name `<fk minus Id>Name` for a foreign key
  the table actually declares; the target comes from that declaration and the label column from the
  target's own metadata. A name that matches no declared key projects nothing, so the parameter can
  widen no query.

A pick writes both halves: choosing a sport sets `sportId` and copies the option's label into
`sportName`, so a saved row never carries a label that disagrees with its key. The option map
(`dropdown`) is still the fallback for a table whose data carries no label column, and it supplies
the per-column filter, which is a dropdown rather than a text box — nobody can type a resource id.

## Where the label column comes from

The adapter resolves the label from what the target table already declares, in this order:

1. `dropdown.labelColumn` on the target's `ISchemaTable` spec.
2. `resource.nameColumn`, when the target is resource-backed with a real display column.
3. `core_resource.resourceName`, when the target is resource-backed without one.

```typescript
// realm/blong-sport/meta/db/db.ts — the target names its own display column
'sport.sport': {order: 410, resource: {nameColumn: 'sportName'}},
```

A target that is neither resource-backed nor labelled contributes nothing: `sport_competition`'s
`federationId` points at a table whose name lives on the party row, so that column keeps its key
until the federation table declares a label of its own.

## Two keys to one table

The join aliases itself after the key column, not after the target, so an athlete and a coach (both
people) never collide:

```typescript
athleteId: {title: 'Athlete', widget: {dropdown: 'sport.athlete', body: 'athleteName'}},
coachId: {title: 'Coach', widget: {dropdown: 'sport.coach', body: 'coachName'}},
```

## A read that builds its own row

An adapter override that selects the row itself bypasses the generic read, and with it the join. It
must delegate instead of querying:

```typescript
// realm/blong-sport/adapter/db/sportCompetitionGet.ts
const base = (await super.exec({...params}, $meta)) as {competition?: Record<string, unknown>};
const competition = base?.competition; // already labelled
// ...attach the editions and return
```

## Column options that ride along

The same `widget` object carries the rest of what a column needs to read well:

| Option                              | Effect                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `body`                              | field rendered in place of the key, projected by the read                                             |
| `lookup`                            | `{optionProperty: rowField}` copied into the row when an option is picked                             |
| `optionsFilter`                     | `{optionProperty: rowField}` narrowing the options to this row; empty row field leaves the list whole |
| `parent`                            | shorthand for the same, when the option carries the key under the field's name                        |
| `translation`                       | route a text cell through the translation dictionary                                                  |
| `formatOptions`                     | `Intl` options per type for a date, time, number, currency or percent cell                            |
| `compare`                           | field holding the value the cell had before the change; both are shown when they differ               |
| `download`, `basePath`, `pathField` | render a `file` cell as a download link built from the row                                            |
| `useGrouping`                       | thousands separator: on for `number`, off for `integer`, unless the column says otherwise             |

A form table also sorts: a column declaring `sort: true` sorts the view on click, and the stored row
order — the order the record was saved in — is left alone.

A narrowed list follows a pick immediately, including in a row that is only being added: the table
keeps the unsaved picks and hands them to the cell editors, so choosing a reef narrows the method
list beside it before the row is saved. A cleared key gives the whole list back, and cancelling the
edit leaves nothing behind.

## A table that edits in place

A table declaring `inlineEdit: true` has no pencil column and no save: every cell that is not
`readOnly` is its own editor, and a change is the edit. A pick writes the label and the `lookup`
fields along with the key, exactly as a saved row does, and a `readOnly` column stays text.

```ts
survey: {
    title: 'Survey',
    type: 'array',
    items: {type: 'object', properties: surveyProperties},
    widget: {type: 'table', columns: ['speciesName', 'reefId', 'transects'], inlineEdit: true},
},
```

Use it where the row is a line in a simple list and the pencil is the obstacle — a checklist, a
small detail table. A row with many columns, or one where a half-finished edit must not be kept,
stays on row editing, where the pencil, *Save* and *Cancel* frame the change.

## See it working

Every capability above has a story in the `blong-browser` Storybook, under
**Editor / TableColumns** (`src/components/Editor/stories/TableColumns.stories.tsx`): labels and the
dropdown filter, the formatter, the compare cell, file cells, the selection cells, sorting, the row
cascade, a table that edits in place and a read-only table. The form-level `optionsFilter` cascade
sits beside the `parent` one in **Editor / CascadedDropdowns → OptionsFilter**.

The set carries the `table-columns` tag, so the interaction stories can be exercised on their own:

```bash
npx test-storybook --url http://127.0.0.1:6006 --includeTags table-columns
```

A date, time or numeric column reads through the shared formatter rather than `toLocaleString`,
and `useGrouping` is only its shortcut — see [Formatting values](./formatting.md) for the
specification and the configuration layers behind it.
