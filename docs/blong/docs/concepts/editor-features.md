# Editor Features

The `Editor` component is the most important and complex feature of the
blong-browser framework. It combines a schema-driven form, a configurable toolbar,
a rich layout system, and a set of advanced interaction patterns into a single
composable component that covers the majority of entity editing use cases.

This document is a **feature guide and placeholder**. Detailed sub-sections
with code examples and Storybook screenshots will be added as each feature
is stabilised.

For implementation reference see `core/blong-browser/src/components/Editor/`.
For usage patterns see [Modular UI](../patterns/blong-browser.md).

---

## 1. Load / Save Lifecycle

The Editor manages the complete load-edit-save cycle for a single entity.

**Goal:** Given an action name for loading and an action name for saving,
the Editor handles all the async plumbing — showing skeletons while loading,
tracking dirty state, enabling/disabling the Save button, and handling
server-side validation errors.

Key props:

- `loadAction` — method name whose result populates the form
- `loadParams` — static params for the load action
- `saveAction` — method name called on submit
- `value` — static initial value (skips `loadAction`)
- `onSave` — callback fired after a successful save

_[Code examples and screenshots to be added]_

---

## 2. Toolbar

The Editor renders a PrimeReact `Toolbar` above and/or below the form.

**Goal:** Provide standard Save / Reset / Edit toggle buttons with correct
enable/disable states derived from form dirty state, plus extensible left and
right button slots for realm-specific actions.

Key behaviours:

- In **read mode** with `editable: true`: Edit (pencil) button
- In **edit mode**: Save and Reset buttons (disabled when form is untouched)
- `toolbar` prop — additional buttons on the left side
- `toolbarRight` prop — additional buttons on the right side
- `designable` — adds a cog button that activates design mode
- Save button shows a popover with server validation error summary

_[Screenshots of each toolbar state to be added]_

---

## 3. Validation

**Goal:** Provide immediate, precise feedback when the user makes an error —
both from client-side rules derived from the JSON Schema and from errors
returned by the server on save.

Sub-features:

- **Client-side required** — fields marked `required: true` in the schema
  show inline errors on submit without a server round-trip
- **Server-side field errors** — `{validation: [{field, message}]}` in the
  server response pushes errors into react-hook-form; each error appears inline
  beneath its field
- **Server error summary** — `error.print` string shown in an OverlayPanel
  anchored to the Save button

_[Validation story screenshots to be added]_

---

## 4. Cards and Layouts

**Goal:** Organise fields into named groups (cards) and arrange those groups
on the page in a configurable layout — without writing layout-specific JSX.

### Cards

A **card** is a named group of fields rendered as a labelled container inside
a PrimeFlex grid column. Cards are defined in `ICardConfig`:

- `label` — card heading
- `widgets` or `fields` — ordered list of field names from the schema
- `className` — PrimeFlex column class (e.g. `'col-12 md:col-6'`)
- `permission` — hide the card when the user lacks this permission
- `hidden` — render fields as hidden inputs, visible in layout only
- `collapsible` — add a collapse toggle to the card header
- `watch` + `match` — conditional visibility based on form field values
  (see Master-Detail and Polymorphic Cards below)

### Layout Types

| Type               | Description                                             |
| ------------------ | ------------------------------------------------------- |
| **Flat**           | Column array; stacked arrays place cards side by side   |
| **Tabs**           | Horizontal tab bar; each tab shows a set of cards       |
| **Steps**          | Wizard-style; last step's Next button submits the form  |
| **Left sidebar**   | vertical PanelMenu accordion on the left (ThumbIndex)   |
| **Right sidebar**  | Same as left but mirrored                               |

Tabs and sidebars support component injection — a tab item can specify a full
React component (e.g. an `Explorer`) instead of a list of cards.

_[Layout diagrams and Storybook screenshots to be added]_

---

## 5. Schema-Driven Widget Resolution

**Goal:** Automatically select the correct input widget for each field from the
JSON Schema type, format, and `widget.type` property — so that no widget
configuration is needed for standard fields.

Widget categories:

1. **Scalar** — single primitive value: text, number, boolean, date, dropdown,
   select, mask, textarea, password, currency, percent, integer, file, image,
   json, divider, label, link, code
2. **Scalar-array** — array of scalar values: multiSelect, multiSelectTree,
   multiSelectPanel, chips, selectTable, multiSelectTreeTable
3. **Vector-array** — array of objects rendered as an editable DataTable

Widget type is resolved from `format`, `type`, and explicit `widget.type`
override, in that priority order.

Custom widgets (via `editors` prop) allow realm-specific input components that
receive `Input`, `Label`, and `ErrorLabel` helper props.

_[Widget gallery to be added]_

---

## 6. Loading States

**Goal:** Provide visual feedback during data loading without layout shifts,
so the user understands something is happening and does not interact with stale
data.

While the `loadAction` is pending, each field renders an animated `<Skeleton>`
placeholder at the same size as the real input. The toolbar is disabled during
loading.

_[Skeleton screenshot to be added]_

---

## 7. Design Mode

**Goal:** Allow authorised users (e.g. system administrators) to rearrange the
field layout, change widget types, and toggle field visibility at runtime —
without a code deployment or development effort.

Design mode is activated by the cog button in the toolbar (`designable={true}`).
While active:

- Cards and fields become draggable (dnd-kit)
- A `PropertyEditor` side panel shows and edits properties of the selected element
- An `DesignAddCardButton` and `DesignAddFieldButton` allow adding new elements
- Saved customisations are persisted server-side, keyed by tenant and component
- On next load, the saved customisation is merged on top of the code defaults

_[Design mode screenshot and interaction walkthrough to be added]_

---

## 8. Master-Detail

**Goal:** Edit the selected row of an inline table directly in a detail card,
without opening a separate page, for compact relational editing
workflows.

A detail card sets `watch: '$.selected.tableName'`. Widget names in the
detail card use the `$.edit.tableName.fieldName` path convention. Changes
update the in-memory row array; the parent form's Save button persists the
whole structure.

Polymorphic variant: multiple detail cards each with a `match` condition
on the selected row — only the matching card is shown at a time.

_[Master-detail Storybook example to be added]_

---

## 9. Cascaded Dropdowns

**Goal:** Filter a child dropdown's options based on the selected value of a
parent dropdown, enabling hierarchical selection (e.g. continent → country →
city) without any custom event handling.

A child dropdown widget declares `widget.parent: 'parentFieldName'`. When the
parent value changes, the child dropdown filters its options to entries whose
`parent` property matches the new parent value.

_[Cascaded dropdown story to be added]_

---

## 10. Cascaded Tables

**Goal:** Filter a child table's rows based on the selected row of a parent
table, enabling parent-child list views in a single page.

The child table widget declares `widget.parent: '$.selected.parentTable'` and
`widget.master: {childKey: 'parentKey'}`. Rows in the child table are filtered
to those matching the selected parent row.

_[Cascaded tables story to be added]_

---

## 11. Polymorphic Layout (typeField)

**Goal:** Switch the active editor layout automatically when a discriminator
field changes (e.g. switching between `'personal'` and `'corporate'` layouts
when the `customerType` field changes).

The `typeField` prop on the Editor watches a specific field; when its value
changes, the Editor selects the matching layout key (e.g. `editPersonal`,
`editCorporate`).

**Status:** Design is specified (see Storybook story stub). Full wiring is
planned.

_[Story stub exists; implementation to be completed]_

---

## 12. Static and Dynamic Pivot

**Goal:** Pre-populate an editable table with a fixed set of rows derived from
either static reference data (static pivot) or a live dropdown list (dynamic
pivot), so users edit per-row values rather than managing the row list itself.

Examples: a permissions matrix (one row per permission), a weekday schedule
(one row per day).

- **Static pivot** — `pivot.examples` provides the seed rows
- **Dynamic pivot** — `pivot.dropdown` names a dropdown list whose entries
  seed the rows; `pivot.join` maps the seed key to the row key field

_[Pivot story screenshots to be added]_

---

## 13. File Upload

**Goal:** Allow users to upload files (images, documents) as part of the form
submission, with the server receiving a `multipart/form-data` payload
transparently.

When a `file` or `image` widget is present in the form, the submit handler
switches from `application/json` to `multipart/form-data`. Regular fields are
serialised as a single JSON blob (`$`); files are attached individually with
path-based names.

_[File upload story to be added]_

---

## 14. Event Bus Integration

**Goal:** Allow external code (analytics, logging, toasts) to observe form
interactions without prop-drilling.

The `blongEvents` singleton emits `action:before`, `action:success`, and
`action:error` events for every dispatch call. The Storybook `withDispatch`
decorator uses this to show success toasts after mutations.

_[See blong-browser SKILL.md for event bus API]_
