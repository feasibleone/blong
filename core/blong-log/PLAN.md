# blong-log Implementation Plan

Remaining work to complete the spec in [real-time-log.md](../docs/blong/docs/rationale/real-time-log.md).

## 1. JSON Syntax Highlighting

The `ThemeConfig.syntax` colors (string, number, boolean, null, key) are already defined but unused.

### Tasks

- Add a `SyntaxHighlight` component that tokenizes a JSON string and wraps each
  token in a `<span>` with the corresponding color from `theme.syntax`.
- Use it in the **EntryModal** to render the full log entry with colored JSON
  instead of plain `<pre>`.
- Use it in the **MessageCell**: when `row.msg` parses as valid JSON, render it
  with syntax highlighting (truncated in the grid cell, full in the modal).

## 2. Formatted Exception View

The current `MessageCell` shows a compact `[Error: message]` inline badge.
The full stack trace is only visible as raw JSON in the modal.

### Tasks

- In the **EntryModal**, when `entry.err` is present, render a dedicated
  **Exception** section above the raw JSON:
  - Error type and message as a header.
  - Stack trace rendered line-by-line with monospace font, each frame on its
    own line, file paths optionally highlighted.
- Keep the inline `[Error: message]` badge in the grid row unchanged.

## 3. HTTP Request/Response Detail View

The grid cell currently shows `METHOD URL` and `STATUS TIME`. Headers and body
are only visible via tooltip. The improved detailed view should appear when the
user clicks to expand the entry in the **EntryModal**, not in the grid cell
itself.

### Tasks

- In the **EntryModal**, when `entry.req` is present, render a dedicated
  **HTTP Request** section:
  - Method and URL as a header line.
  - Headers rendered as a key-value table.
  - Body rendered with JSON syntax highlighting (using the `SyntaxHighlight`
    component from task 1) when the content is JSON, or as plain text otherwise.
- In the **EntryModal**, when `entry.res` is present, render a dedicated
  **HTTP Response** section:
  - Status code (color-coded) and response time as a header line.
  - Headers rendered as a key-value table.
  - Body rendered with JSON syntax highlighting when JSON, plain text otherwise.
- The grid cell (`HttpCell`) stays compact — no change needed there.

## 4. Exception Filter

The spec says filtering by exception should be possible. No dedicated control
exists today.

### Tasks

- Add a toggle button or checkbox to the toolbar: **"Has Error"**.
- When active, filter entries client-side to those where `entry.err` is truthy.
- Also pass the filter to the server via WebSocket subscribe message so the
  server-side `#entryMatchesFilters` can skip non-error entries before
  broadcasting.
- Add `hasError?: boolean` to `FilterOptions` and handle it in
  `CircularBuffer.#applyFilters` and `LogServer.#entryMatchesFilters`.

## 5. Dynamic Custom Property Filters

`PropertyConfig.custom` is typed with `name`, `label`, `filterable`, and
`values` but the UI ignores it.

### Tasks

- When `clientConfig.properties.custom` is present, generate additional toolbar
  controls dynamically:
  - If `values` is provided → render a `<select>` dropdown with predefined
    options.
  - If `values` is absent but `filterable` is true → render a text input.
- Pass selected custom property values in `filters.properties` when subscribing
  via WebSocket and when querying the REST API.
- Optionally render additional grid columns for custom properties.

## 6. Service Name Dropdown with Predefined Values

The spec says filtering allows dropdowns with predefined values. The service
name filter is currently a free text input.

### Tasks

- Track unique service names seen in the entries (client-side).
- Render the service name filter as a combo control: a `<select>` dropdown
  listing known service names, plus a free text option.
- Alternatively, use a `<datalist>` attached to the existing `<input>` so users
  get autocomplete suggestions while still being able to type freely.

## 7. Server-Side Snapshot Tests

The spec calls for snapshot testing on the server side. Current tests use
assertion-based TAP tests.

### Tasks

- Add snapshot assertions to `server.test.ts` for REST API responses:
  - `GET /api/config` → snapshot the full config JSON.
  - `GET /api/entries` with known seed data → snapshot the response shape.
  - `GET /api/search?search=...` → snapshot filtered results.
- Use TAP's built-in `t.matchSnapshot()` for snapshot comparisons.
- Commit the generated `.test.cjs.snap` files as baselines.

## 8. Storybook Stories for New Features

After implementing items 1–4, add Storybook coverage.

### Tasks

- Add a story for the **EntryModal** in isolation, showing:
  - An entry with a JSON message (syntax highlighted).
  - An entry with an exception (formatted stack trace).
  - An entry with HTTP request + response (headers, JSON body).
- Add a story for the **"Has Error" filter** toggle.
- Update existing stories if the toolbar gains new controls (custom filters,
  service name dropdown).
- Re-generate visual snapshot baselines with `npm run visual:update`.

## Implementation Order

| Phase | Items | Rationale |
|-------|-------|-----------|
| 1 | 1 (syntax highlight) | Foundation used by items 2, 3 |
| 2 | 2 (exception view), 3 (HTTP detail view) | Both render in EntryModal, both use syntax highlight |
| 3 | 4 (exception filter), 5 (custom filters), 6 (service dropdown) | Toolbar enhancements, independent of each other |
| 4 | 7 (server snapshots), 8 (storybook updates) | Testing, done last to capture final state |
