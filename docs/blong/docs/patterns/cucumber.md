# Cucumber / Gherkin Testing

## Overview

`@feasibleone/blong-cucumber` brings
[Behaviour-Driven Development (BDD)](https://cucumber.io/docs/bdd/) to the blong test framework. It
provides:

- A fully compliant Gherkin parser (via `@cucumber/gherkin`)
- Cucumber-expression step matching (`{int}`, `{float}`, `{word}`, `{string}`, `{}`)
- Automatic Scenario Outline expansion
- A `featureToSteps` converter that turns Gherkin features into standard blong `ChainStep[]` arrays
  — no new test runner needed

## When to use

Use cucumber-style testing when:

- Your team prefers writing test intent in natural language (Given/When/Then)
- You are migrating from cucumber-js or another BDD framework
- Acceptance tests need to be readable by non-developers

For pure handler-level tests, the regular blong test pattern is simpler (see [test.md](./test.md)).

### When the table is the test

The format earns its cost in one situation: when the artifact a person needs to read **is a table**,
and the assertion is a comparison against it. The ACL matrices in `realm/blong-party` are the worked
example — a row per viewer, a column per record, a verdict per cell — and what they buy is worth
naming, because it is not "tests in English":

- **The scenario is the specification, the report and the test.** Nobody has to read the step
  definitions to know what access is expected; the Data Table says it, the step asserts it and a red
  run prints it back.
- **A failing cell is located, not described.** The step asserts once, with the redrawn table as its
  message: the offending cell reads `expected≠actual`, every mismatch is named (row, column, both
  values) underneath, and the reader finds it without reading code. That contract is itself a
  feature — `test.acl.diagnostics` drives the helpers with a deliberately wrong table, so a report
  that stopped marking cells fails a test instead of rotting.
- **The fixture can be asserted too.** A `Background` of Data Tables, one column per predicate
  (`belongsTo`, `hasScope`, …), states the records the matrix is derived from and checks them
  against the graph — so the feature file is self-contained, and a seed that drifts from it fails.
- **Repetition is cheap and the logic is shared.** The same fixture block appears in four features
  on purpose (each reads on its own); the step definitions are two factories, so the repetition
  carries no code.

Two costs, both measured rather than guessed. Every cell is a real call through the gateway — the
application matrix takes about ninety seconds — so a table should assert a shape, not re-probe what
a unit test already covers; and the runner labels steps by the step function's name plus a per-step
suffix, so four fixture steps built by one factory need four distinct names (see
[Background sections](#background-sections)). The [`realm/blong-party` matrices](./acl.md) are the
full example, including how the probes declare the refusals they expect so a green run does not fill
the log with errors.

## Feature file format

Feature files are exported as template-literal strings:

```typescript
// realmname/server/test/feature/calculator.ts
export default `Feature: Calculator

  Scenario: Add two numbers
    Then 5 plus 3 equals 8

  Scenario Outline: Parameterized calculation
    Then <a> plus <b> equals <result>

    Examples:
      | a  | b  | result |
      | 1  | 2  | 3      |
      | 10 | 20 | 30     |
`;
```

Supported Gherkin constructs:

| Construct                            | Supported                            |
| ------------------------------------ | ------------------------------------ |
| Feature                              | ✅                                   |
| Scenario                             | ✅                                   |
| Scenario Outline + Examples          | ✅                                   |
| Background                           | ✅                                   |
| Given / When / Then / And / But / \* | ✅                                   |
| Tags                                 | ✅ (parsed, not filtered)            |
| Doc Strings                          | ✅ (accessible via `step.docString`) |
| Data Tables                          | ✅ (accessible via `step.dataTable`) |
| Rule                                 | ❌ (not yet supported)               |

## Step definitions

Each step definition is a function that receives extracted parameters and returns an **async step
function**:

```typescript
import {featureToSteps} from '@feasibleone/blong-cucumber';

'{int} plus {int} equals {int}': (a, b, expected) =>
    async function addEquals(assert, {$meta}) {
        const result = await cucumberCalculatorAdd({a, b}, $meta);
        assert.equal(result, expected, `${a} + ${b} should equal ${expected}`);
    },
```

Step parameter types:

| Expression | Matches            | Coerced to                                   |
| ---------- | ------------------ | -------------------------------------------- |
| `{int}`    | `-?\\d+`           | `number`                                     |
| `{float}`  | `-?\\d+(\\.\\d+)?` | `number` (including `"3.0"` → `3`)           |
| `{word}`   | `\\w+`             | `string`                                     |
| `{string}` | `"..."` (quoted)   | `string` (without quotes)                    |
| `{}`       | `.+`               | `string`                                     |
| RegExp     | any                | string captures (use array-of-tuples format) |

### Step context — Data Tables and Doc Strings

Every step definition receives the parsed Gherkin step as its **last** argument, after any captured
parameters:

```typescript
import {featureToSteps, type IStepContext} from '@feasibleone/blong-cucumber';

featureToSteps(
    feature,
    {
        'the allowance matrix is': (step: IStepContext) =>
            async function matrix(assert, {$meta}) {
                // step.keyword   — 'Then'
                // step.text      — 'the allowance matrix is'
                // step.dataTable — string[][] (one entry per row, one per cell)
                // step.docString — the Doc String content, without the fences
                assert.ok(step.dataTable?.length, 'the table has rows');
            },
    },
    {name, group},
);
```

A definition that declares only its captures keeps working — the context is simply an extra argument
it ignores. That is the whole extension: a Data Table step is a step whose only argument is the
context, so a table is read as data rather than folded into the step text.

### Using RegExp patterns

Pass step definitions as an array of tuples to mix cucumber expressions with raw `RegExp` patterns:

```typescript
featureToSteps(
    feature,
    [
        [
            /^the result is (\d+)$/,
            expected =>
                async function checkResult(assert, {$meta}) {
                    // ...
                },
        ],
        [
            '{int} plus {int} equals {int}',
            (a, b, expected) =>
                async function addEquals(assert, {$meta}) {
                    // ...
                },
        ],
    ],
    {name, group},
);
```

## Wiring features to step definitions

The `featureToSteps` function connects a feature string to step definitions and returns a named step
array compatible with the blong test runner:

```typescript
// realmname/server/test/test/testCalculator.ts
import {type IMeta, handler} from '@feasibleone/blong';
import {featureToSteps} from '@feasibleone/blong-cucumber';
import calculatorFeature from '../feature/calculator.ts';

export default handler(({lib: {group}, handler: {cucumberCalculatorAdd}}) => ({
    testCalculator: ({name = 'calculator'}, $meta: IMeta) =>
        featureToSteps(
            calculatorFeature,
            {
                '{int} plus {int} equals {int}': (a, b, expected) =>
                    async function addEquals(assert, {$meta}) {
                        const result = await cucumberCalculatorAdd({a, b}, $meta);
                        assert.equal(result, expected);
                    },
            },
            {name, group},
        ),
}));
```

`featureToSteps(source, stepDefs, options)` returns:

```text
group(name ?? featureName)([
    group(scenario1Name)([step1, step2, ...]),
    group(scenario2Name)([step1, step2, ...]),
    ...Scenario Outline rows expanded...
])
```

Each step is automatically renamed with a scenario-index suffix to guarantee unique function names
across scenarios within the same test execution context.

## Scenario Outline / Examples tables

Scenario Outlines are automatically expanded into concrete scenarios:

```gherkin
Scenario Outline: Parameterized calculation
  Then <a> plus <b> equals <result>

  Examples:
    | a  | b  | result |
    | 1  | 2  | 3      |
    | 10 | 20 | 30     |
```

Produces two concrete scenarios:

- `"Parameterized calculation | 1, 2, 3"` — `Then 1 plus 2 equals 3`
- `"Parameterized calculation | 10, 20, 30"` — `Then 10 plus 20 equals 30`

## Background sections

A `Background` section is prepended to every scenario in the feature:

```gherkin
Feature: Secure calculator

  Background:
    Given I am logged in as admin

  Scenario: Add numbers
    Then 5 plus 3 equals 8
```

The `Given I am logged in as admin` step runs before each scenario's steps.

Two consequences of that "before each scenario" are worth knowing. A `Background` is the right place
for a fixture a feature asserts once but every scenario depends on — a Data Table there is written
once and checked before each scenario, which is how the ACL matrices declare the records their cells
are derived from (see [the ACL pattern](./acl.md)). And because the runner labels each step with the
step function's name plus a per-step suffix, **two steps of one scenario must not share a function
name**: four fixture steps defined by one factory would all report as `assertAclFixture_s0`, `_s1`,
… and the run fails with "Duplicate step name detected". Name the function after the table it
asserts (a small `Object.defineProperty(fn, 'name', …)` helper in the factory is enough).

## Running cucumber tests

Cucumber tests run exactly like any other blong test — they are activated by the watch configuration
in `server.ts`:

```typescript
// server.ts — the group name, not the file name: testCucumberCalculator is test.cucumber.calculator
config: {
    integration: {
        watch: {
            test: ['test.cucumber.calculator'],
        },
    },
},
```

Run with:

```bash
npm run ci-test
```

## Low-level API

The library also exports the individual parser and matcher functions for advanced use:

```typescript
import {
    parseGherkin, // string → IGherkinFeature
    expandOutline, // IGherkinScenario → IGherkinScenario[]
    compileCucumberExpression, // string → RegExp
    matchStep, // (text, patterns) → {patternKey, params} | null
    featureToSteps, // (source, stepDefs, options) → ChainStep[]
} from '@feasibleone/blong-cucumber';
```

## Example

See `core/blong-cucumber/` for a complete working example using a simple calculator realm.
