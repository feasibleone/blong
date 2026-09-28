# Chain

A chain is what a test handler returns: an ordered list of steps, written in the order a person
would explain them, executed in whatever order their data needs allow. `blong-chain` is the executor
behind `group(name)([...])`, and it is the reason a test file reads as a sequence while the run
behaves as a graph.

## Key behaviours

- **Dependencies are observed, not declared.** A step's context is a thenable proxy; reading a
  property records an edge to the step of that name and hands back a promise that resolves with its
  result. A step that touches no context runs immediately.
- **Everything is dispatched; the queue decides.** All steps at a level are started, and the
  executor's concurrency limit (ten by default) bounds how many run at once. A step waiting on a
  dependency is waiting, not failing — the edge is a promise, not a schedule.
- **Groups nest.** An inner array is a sub-test with its own name; an empty array is a barrier that
  waits for everything before it.
- **Names are checked.** A duplicate step name, or a reference to a step that does not exist, fails
  the run and names the offender rather than producing a confusing timeout.
- **The run reports its own graph.** After execution the executor can show the dependency graph,
  each step's queue time and execution time, the critical path and the parallel efficiency of the
  test.

See the [test patterns](../patterns/test.md) for the step and context syntax,
[Cucumber](../patterns/cucumber.md) for chains derived from `.feature` files, and the
[unified handler test rationale](../rationale/unified-handler-test.md) for why handlers and tests
share one step model.
