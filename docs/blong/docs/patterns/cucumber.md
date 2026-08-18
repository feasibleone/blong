# Cucumber / Gherkin Testing

## Overview

`@feasibleone/blong-cucumber` brings [Behaviour-Driven Development (BDD)](https://cucumber.io/docs/bdd/)
to the blong test framework. It provides:

- A fully compliant Gherkin parser (via `@cucumber/gherkin`)
- Cucumber-expression step matching (`{int}`, `{float}`, `{word}`, `{string}`, `{}`)
- Automatic Scenario Outline expansion
- A `featureToSteps` converter that turns Gherkin features into standard
  blong `ChainStep[]` arrays — no new test runner needed

## When to use

Use cucumber-style testing when:

- Your team prefers writing test intent in natural language (Given/When/Then)
- You are migrating from cucumber-js or another BDD framework
- Acceptance tests need to be readable by non-developers

For pure handler-level tests, the regular blong test pattern is simpler
(see [test.md](./test.md)).

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

| Construct | Supported |
|---|---|
| Feature | ✅ |
| Scenario | ✅ |
| Scenario Outline + Examples | ✅ |
| Background | ✅ |
| Given / When / Then / And / But / * | ✅ |
| Tags | ✅ (parsed, not filtered) |
| Doc Strings | ✅ (accessible via `step.docString`) |
| Data Tables | ✅ (accessible via `step.dataTable`) |
| Rule | ❌ (not yet supported) |

## Step definitions

Each step definition is a function that receives extracted parameters and
returns an **async step function**:

```typescript
import {featureToSteps} from '@feasibleone/blong-cucumber';

'{int} plus {int} equals {int}': (a, b, expected) =>
    async function addEquals(assert, {$meta}) {
        const result = await cucumberCalculatorAdd({a, b}, $meta);
        assert.equal(result, expected, `${a} + ${b} should equal ${expected}`);
    },
```

Step parameter types:

| Expression | Matches | Coerced to |
|---|---|---|
| `{int}` | `-?\\d+` | `number` |
| `{float}` | `-?\\d+(\\.\\d+)?` | `number` (including `"3.0"` → `3`) |
| `{word}` | `\\w+` | `string` |
| `{string}` | `"..."` (quoted) | `string` (without quotes) |
| `{}` | `.+` | `string` |
| RegExp | any | string captures (use array-of-tuples format) |

### Using RegExp patterns

Pass step definitions as an array of tuples to mix cucumber expressions with
raw `RegExp` patterns:

```typescript
featureToSteps(
    feature,
    [
        [/^the result is (\d+)$/, (expected) =>
            async function checkResult(assert, {$meta}) {
                // ...
            },
        ],
        ['{int} plus {int} equals {int}', (a, b, expected) =>
            async function addEquals(assert, {$meta}) {
                // ...
            },
        ],
    ],
    {name, group},
)
```

## Wiring features to step definitions

The `featureToSteps` function connects a feature string to step definitions
and returns a named step array compatible with the blong test runner:

```typescript
// realmname/server/test/test/testCalculator.ts
import {type IMeta, handler} from '@feasibleone/blong';
import {featureToSteps} from '@feasibleone/blong-cucumber';
import calculatorFeature from '../feature/calculator.ts';

export default handler(
    ({lib: {group}, handler: {cucumberCalculatorAdd}}) => ({
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
    }),
);
```

`featureToSteps(source, stepDefs, options)` returns:

```text
group(name ?? featureName)([
    group(scenario1Name)([step1, step2, ...]),
    group(scenario2Name)([step1, step2, ...]),
    ...Scenario Outline rows expanded...
])
```

Each step is automatically renamed with a scenario-index suffix to guarantee
unique function names across scenarios within the same test execution context.

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

## Running cucumber tests

Cucumber tests run exactly like any other blong test — they are activated by
the watch configuration in `server.ts`:

```typescript
// server.ts
config: {
    integration: {
        watch: {
            test: ['test.realm.calculator'],
        },
    },
},
```

Run with:

```bash
npm run ci-test
```

## Low-level API

The library also exports the individual parser and matcher functions for
advanced use:

```typescript
import {
    parseGherkin,    // string → IGherkinFeature
    expandOutline,   // IGherkinScenario → IGherkinScenario[]
    compileCucumberExpression, // string → RegExp
    matchStep,       // (text, patterns) → {patternKey, params} | null
    featureToSteps,  // (source, stepDefs, options) → ChainStep[]
} from '@feasibleone/blong-cucumber';
```

## Example

See `core/blong-cucumber/` for a complete working example using a simple
calculator realm.
