# blong-allure

Allure 3 test reporting integration for the Blong framework.

## Overview

`blong-allure` bridges `blong-chain`'s `TestExecutor` event system to Allure 3's file-based result format. Each test step produces a `{uuid}-result.json` file that the `allure generate` CLI transforms into an interactive HTML report.

This is a framework-level capability available to all blong test suites, not just blong-ttk.

## Features

- **Streaming result writing**: Test results are written as they complete, ensuring partial results survive crashes
- **Native Allure 3 format**: Direct JSON file writing without dependency on `allure-js-commons`
- **Trace link integration**: Automatic trace links to blong-log via `$meta.traceId`
- **History tracking**: Trend analysis across runs via `allurerc.yaml` + `history.jsonl`
- **Flexible lifecycle**: Hooks for session start/end with optional report generation

## Usage

```typescript
import {allureSessionStart, allureSessionEnd} from '@feasibleone/blong-allure';
import {TestExecutor} from '@feasibleone/blong-chain';

// Start Allure session
await allureSessionStart({
    outputDir: 'allure-results',
    historyPath: '.allure/history.jsonl',
});

// Create and run tests with TestExecutor
const executor = new TestExecutor(/* ... */);

// Subscribe to events and write results
// (handled by lifecycle hooks)

// End session and optionally generate report
await allureSessionEnd({
    generateOnEnd: true, // Optional: invoke `allure generate`
});
```

## Configuration

Configure via blong config keys:

- `allure.outputDir`: Output directory for result files (default: `allure-results`)
- `allure.historyPath`: Path to history file (default: `.allure/history.jsonl`)
- `allure.generateOnEnd`: Auto-generate HTML report on session end (default: `false`)

## Result File Format

Each test step is written as an Allure 3 result file:

```json
{
  "uuid": "9d95e6e7-9cf6-4ca5-91b4-9b69ce0971f8",
  "historyId": "2b35e31882061875031701ba05a3cd67",
  "fullName": "realm/collection/test.stepName",
  "name": "stepName",
  "labels": [
    {"name": "parentSuite", "value": "realm"},
    {"name": "suite", "value": "collection"},
    {"name": "subSuite", "value": "group"},
    {"name": "framework", "value": "blong"},
    {"name": "language", "value": "typescript"}
  ],
  "links": [
    {"type": "trace", "name": "Trace", "url": "http://log.example/trace/abc123"}
  ],
  "status": "passed",
  "start": 1682358426014,
  "stop": 1682358426892,
  "steps": []
}
```

## Architecture

- `writer/` - Result file writing and mapping
- `lifecycle/` - Session management and event subscription
- `config/` - Configuration file generation
