# Test Rerun with Diagnostics

Automatic rerun of failing tests with increased logging and tracing to collect
diagnostic data for inclusion in test reports.

## Problem

When a test fails in a CI/CD pipeline or during a test run, the available
diagnostic information is often insufficient to determine the root cause. The
standard log level during test execution is typically set to minimize noise and
maximize performance, which means detailed diagnostic data is not captured when
it is needed most — at the point of failure.

This creates a frustrating cycle:

1. Test fails with insufficient diagnostic data
2. Developer must reproduce the failure locally with increased logging
3. Reproduction may be difficult due to environmental differences, timing
   issues, or data-dependent conditions
4. Time is wasted on manual debugging instead of fixing the actual issue

## Solution

Implement an automatic rerun mechanism that:

1. **Detects failures**: After a test step or test group fails, the framework
   identifies the failed tests
2. **Increases diagnostics**: Before rerunning, the framework increases the
   log level, enables detailed tracing, and activates additional diagnostic
   collectors
3. **Reruns selectively**: Only the failing tests (and their required setup
   steps) are rerun, minimizing additional execution time
4. **Captures diagnostics**: The rerun produces detailed logs, traces, and
   other diagnostic data
5. **Includes in report**: The diagnostic data from the rerun is attached to
   the test report alongside the original failure information

### Design Considerations

#### Selective Rerun

Not all tests should be rerun. The rerun mechanism should:

- Rerun only tests that failed (not skipped or passed tests)
- Include setup and teardown steps required by the failing tests
- Respect test dependencies tracked by `blong-chain`
- Allow configuration of maximum rerun count (default: 1)

#### Diagnostic Data Collection

The rerun should collect:

- **Increased log level**: Set to `debug` or `trace` during rerun
- **Distributed traces**: Full trace data with span details
- **Request/response payloads**: Complete HTTP request and response bodies
- **State snapshots**: Database or service state at key points if accessible
- **Timing details**: Detailed timing for each sub-operation

#### Report Integration

The diagnostic data should be included in the test report as:

- A separate "diagnostics" section for each failing test
- Links to trace views (using the trace URL pattern from blong-log)
- Formatted log entries relevant to the failing test
- Clear indication that this data is from the diagnostic rerun, not the
  original run

#### Performance Impact

The rerun adds execution time, which should be managed by:

- Only rerunning failing tests (not the entire suite)
- Allowing configuration to disable reruns (for time-sensitive CI pipelines)
- Reporting the additional time separately so it's visible

### Implementation Phases

#### Phase 1: Foundation

- Add `rerun` configuration option to the test executor
- Implement failure detection and selective test identification
- Create the mechanism to modify log level between runs

#### Phase 2: Diagnostic Collection

- Implement diagnostic data collectors (logs, traces, payloads)
- Create a diagnostic data format that integrates with the test report
- Add trace correlation between the original run and the rerun

#### Phase 3: Report Integration

- Include diagnostic data in the HTML and JSON reports
- Add links to trace views for failing tests
- Provide a summary of rerun results (did the rerun pass or fail again?)

### Relationship to Blong Framework

This feature integrates with:

- **blong-chain**: Uses the dependency graph to determine which setup steps
  are needed for selective reruns
- **blong-log**: Leverages the real-time log infrastructure for capturing
  detailed logs during reruns
- **blong-test**: Extends the test dispatch mechanism to support rerun
  configuration
- **blong-ttk**: The testing toolkit uses this feature for API test
  collections that run against external services

### Configuration

```typescript
const executor = new TestExecutor({
    concurrency: 10,
    rerun: {
        enabled: true,
        maxRetries: 1,
        logLevel: 'debug',
        collectTraces: true,
        collectPayloads: true,
    },
});
```

**Note:** The `rerun` configuration option and the selective failure detection
pipeline are not yet implemented. Current test execution in `blong-chain` runs
steps to completion and reports failures via TAP, but does not automatically
rerun failing steps with increased diagnostics. The configuration schema above
describes the intended API for implementation.

### Future Considerations

- **Flaky test detection**: If a test passes on rerun, flag it as potentially
  flaky
- **Automatic issue creation**: Create issues or tickets for persistent
  failures with attached diagnostic data
- **Historical analysis**: Track rerun patterns over time to identify
  systemic issues

## Future Ideas

1. **Flaky test quarantine** — automatically quarantine tests that pass on
   rerun. After N consecutive passes, the test is reinstated. The quarantine
   registry is stored per-suite and visible in the test report, making
   flakiness a first-class concept rather than a noise source.

2. **Differential diagnostics** — when a test fails on rerun too, compare
   the structured diagnostic data (logs, traces, timing) from the original
   run and the rerun to highlight what changed between attempts. A timing
   spike, a missing trace span, or a different HTTP error code narrows the
   root cause significantly.

3. **Pre-flight diagnostic baseline** — run the full test suite once with
   `checkpointMode: 'debug'` before a release deployment and store the
   resulting checkpoint and timing data as a baseline. Post-deployment tests
   are compared against this baseline so that regressions in performance or
   intermediate state are caught even when the final assertion still passes.
