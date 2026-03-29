---
name: blong-cucumber
description: Implement BDD-style Cucumber/Gherkin tests in Blong using @cucumber/gherkin as the fully compliant parser. Converts .feature file strings into blong ChainStep[] arrays via featureToSteps. Step definitions map Gherkin patterns to handler calls. Supports Scenario Outline, Background, and all cucumber expression types. Use this skill whenever the user wants to write Gherkin feature files, define Given/When/Then steps, run BDD tests, or integrate cucumber-style testing with blong handlers.
---

# Implementing Cucumber/Gherkin Tests

## Overview

`@feasibleone/blong-cucumber` adds BDD-style testing to blong. It uses
`@cucumber/gherkin` as a fully spec-compliant parser and integrates with the
existing blong test runner — no new test infrastructure required.

## Package dependency

Add to `package.json`:

```json
{
    "dependencies": {
        "@feasibleone/blong-cucumber": "workspace:^1.0.0"
    }
}
```

## File structure

```
realmname/
└── test/
    ├── feature/             # Gherkin feature files as TS template literals
    │   └── calculator.ts
    └── test/                # Test handlers wiring features to step defs
        └── testCalculator.ts
```

## 1. Write a feature file

Export the Gherkin source as a template literal string:

```typescript
// realmname/test/feature/calculator.ts
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

## 2. Write step definitions in a test handler

```typescript
// realmname/test/test/testCalculator.ts
import {type IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';
import {featureToSteps} from '@feasibleone/blong-cucumber';
import calculatorFeature from '../feature/calculator.ts';

export default handler(
    ({lib: {group}, handler: {realmCalculatorAdd}}) => ({
        testCalculator: ({name = 'calculator'}: {name?: string}, $meta: IMeta) =>
            featureToSteps(
                calculatorFeature,
                {
                    '{int} plus {int} equals {int}': (
                        a: unknown,
                        b: unknown,
                        expected: unknown,
                    ) =>
                        async function addEquals(
                            assert: typeof Assert,
                            {$meta}: {$meta: IMeta},
                        ) {
                            const result = await realmCalculatorAdd(
                                {a: a as number, b: b as number},
                                $meta,
                            );
                            assert.equal(result, expected as number, `${a} + ${b} = ${expected}`);
                        },
                },
                {name, group},
            ),
    }),
);
```

## 3. Activate in server.ts

```typescript
// server.ts
config: {
    integration: {
        remote: {canSkipSocket: true},
        watch: {
            test: ['test.realm.calculator'],
        },
    },
},
```

## Step parameter types

| Expression | Example match | JS type |
|---|---|---|
| `{int}` | `42`, `-7` | `number` |
| `{float}` | `3.14`, `-0.5` | `number` |
| `{word}` | `hello` | `string` |
| `{string}` | `"hello world"` | `string` (unquoted) |
| `{}` | any text | `string` |
| RegExp | anything | string captures |

## Scenario Outline expansion

Scenario Outlines are automatically expanded by `featureToSteps`:

```gherkin
Scenario Outline: Transfer
  Then sending <amount> <currency> succeeds

  Examples:
    | amount | currency |
    | 100    | USD      |
    | 50     | EUR      |
```

Produces scenarios:
- `"Transfer | 100, USD"` → `Then sending 100 USD succeeds`
- `"Transfer | 50, EUR"` → `Then sending 50 EUR succeeds`

## Background

Background steps are prepended to every scenario automatically:

```gherkin
Feature: Secure API

  Background:
    Given I am authenticated as admin

  Scenario: Get data
    Then getting data succeeds
```

## Important: step function naming

Each step definition should return an async function with a **descriptive
unique name**. `featureToSteps` adds a scenario-index suffix (`_s0`, `_s1`,
etc.) to guarantee uniqueness across scenarios in the same test run. This
suffix is transparent to the test output but prevents duplicate-name errors in
the blong-chain executor.

Use **self-contained steps** (computation + assertion in one function) to
keep step definitions simple and avoid inter-step context dependencies.

## Low-level API

```typescript
import {
    parseGherkin,            // parse Gherkin string → IGherkinFeature
    expandOutline,           // expand Scenario Outline → IGherkinScenario[]
    compileCucumberExpression, // compile expression string → RegExp
    matchStep,               // match step text against patterns
    featureToSteps,          // main conversion function
} from '@feasibleone/blong-cucumber';
```

## Concept doc

See `docs/blong/docs/patterns/cucumber.md` for full documentation.
