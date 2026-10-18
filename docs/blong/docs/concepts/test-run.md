# Test runs

A **Test runs** page is a portal page that starts an automated test scenario and shows the run while
it happens: the steps in flight, the assertions each one made, the values it read from the steps
before it, and the branch a decision took.

The page is not a generic method runner. The host supplies a **catalog** of scenarios, and the page
refuses a method the catalog does not list. A catalog entry names where its steps run:

- **browser** — the test group executes in the page's own window, beside the application it is
  testing.
- **server** — the test group executes in the process that owns the server-only handlers, while the
  page polls its event log.

Both hosts produce the same JSON-safe run model, and the page reduces both with the same reducer. A
run can therefore be recorded, replayed and compared without a server being involved.

The console shows the run as a **tree-table** of steps over a shared timeline, a **dependency
graph** and a details panel with the result, progress points and assertion log. The
`Components/TestRun` Storybook stories include a live `Replay` of a recorded run.

See the [pattern](../patterns/test-run.md) for the page, catalog, transport and server
configuration. See the [rationale](../rationale/test-run.md) for why the console is part of the
application rather than a report.
