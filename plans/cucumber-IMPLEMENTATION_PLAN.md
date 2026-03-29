# Cucumber/Gherkin Test Support for Blong

## Overview

### Problem

The blong test framework currently provides a powerful handler-based testing
model with parallel execution, automatic dependency detection, and test reuse
via the `group` function. However:

1. **Test reuse documentation is limited** — existing docs and examples only
   show the `name` parameter for test handlers (e.g., `{name = 'example'}`),
   while test handlers already support arbitrary parameters (e.g.,
   `{name, username, amount}`). This is underdocumented and lacks illustrative
   examples.

2. **No Cucumber/Gherkin support** — teams familiar with Behavior-Driven
   Development (BDD) cannot write tests in Gherkin syntax and run them through
   the existing blong test engine. The framework already has nascent support
   (`ModuleApi.feature()`, `ModuleApi.step()` in types, feature files in
   `core/test/demo/test/feature/`), but these are currently no-ops or
   unfinished stubs.

3. **No example suite** — there is no reference implementation showing how
   cucumber-style tests integrate with the blong ecosystem.

### Success Criteria

- Documentation and skill files clearly show test handler reuse with arbitrary
  parameters (beyond just `name`), including practical examples.
- A Gherkin parser loads `.feature` files or template literal strings and
  produces blong-compatible test step arrays.
- Scenario steps map to existing blong test handlers via step definitions.
- Scenario Outline / Examples tables generate parameterized test runs.
- An example suite (`core/blong-cucumber` or similar) demonstrates end-to-end
  cucumber test execution using the existing blong-chain test runner.
- Existing tests continue to pass — no breaking changes.

### Who Uses This

- **Framework users** writing BDD-style acceptance tests in Gherkin.
- **Teams migrating** from cucumber-js or similar BDD frameworks.
- **Developers** who want clearer test intent via Given/When/Then natural
  language, while keeping blong's parallel execution and handler reuse.

## Current State Analysis

### What Exists

| Component | Location | Status |
|---|---|---|
| `group` lib function | `ILib.group` in `core/blong/types.ts:526` | ✅ Working |
| Test handler reuse | `testLoginTokenCreate({}, $meta)` pattern | ✅ Working, underdocumented |
| Arbitrary params | `{name, username, amount}` destructuring | ✅ Working, underdocumented |
| `ModuleApi.feature()` | `core/blong/types.ts:617` | 🔴 Type defined, no-op in `layerProxy.ts:24` |
| `ModuleApi.step()` | `core/blong/types.ts:618` | 🔴 Type defined, not implemented |
| Feature files (Gherkin strings) | `core/test/demo/test/feature/login.ts`, `fetchCountry.ts` | 🟡 Files exist, not consumed |
| blong-chain TestExecutor | `core/blong-chain/index.ts` | ✅ Working parallel executor |
| blong-ttk parser | `core/blong-ttk/library/parser.ts` | ✅ ML-TTK JSON parser (different format) |
| Test docs | `docs/blong/docs/patterns/test.md` | 🟡 Only shows `name` param |
| blong-test skill | `.github/skills/blong-test/SKILL.md` | 🟡 Shows custom params but no reuse examples |

### Key Insight: Reuse via Parameters

The existing test handler pattern already supports arbitrary parameters:

```typescript
testExample: ({name = 'example', username = 'testuser', amount = 100}, $meta) =>
    group(name)([
        async function test(assert, {$meta}) {
            const result = await handler({username, amount}, $meta);
            assert.ok(result);
        },
    ]);
```

A reusing handler can call this with different parameters:

```typescript
testScenario: ({name = 'scenario'}, $meta) =>
    group(name)([
        testExample({name: 'with admin', username: 'admin', amount: 500}, $meta),
        testExample({name: 'with user', username: 'user', amount: 100}, $meta),
    ]);
```

This is the foundation for cucumber support — Gherkin steps map to handler
calls with specific parameters.

## Technical Approach

### Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Gherkin Source                       │
│  .feature files  or  template literal strings         │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│              Gherkin Parser (library)                  │
│  Parses Feature/Scenario/Step/Examples                 │
│  Produces structured AST                              │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│           Step Resolver (library)                      │
│  Maps step text → handler calls with params           │
│  Uses cucumber expression / regex patterns             │
│  Extracts {int}, {string}, {float} parameters         │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│         Test Array Generator (library)                 │
│  Converts scenarios → blong ChainStep[] arrays        │
│  Handles Scenario Outline → multiple parameterized    │
│  runs via Examples table                              │
│  Sets group names from Feature/Scenario names          │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│          blong-chain TestExecutor                      │
│  Existing parallel execution engine                    │
│  No changes needed                                    │
└──────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Gherkin parser**: Use `@cucumber/gherkin-utils` or a lightweight custom
   parser. The existing `core/test/demo/test/feature/` files export Gherkin as
   template literal strings — the parser should support both string input and
   file paths. Given the framework's zero-dependency philosophy, a lightweight
   custom parser is preferred, keeping `@cucumber/gherkin` as an optional
   peer dependency for teams that need full spec compliance.

2. **Step definitions as handlers**: Each step definition is a regular blong
   handler. The step text pattern maps to a handler name. Parameters extracted
   from the step text (cucumber expressions like `{int}`, `{string}`, or
   regex captures) are passed as handler params alongside `$meta`.

3. **Scenario Outline → Parameterized reuse**: Each row in the Examples table
   generates a separate test group, reusing the same step handlers with
   different parameters. This leverages the existing arbitrary-parameter
   support.

4. **Feature files as handler groups**: Feature files produce named test
   arrays (`group(featureName)([...steps])`) that plug directly into the
   existing test dispatch mechanism.

5. **No new test runner**: The cucumber support produces standard blong
   `ChainStep[]` arrays. The existing `blong-chain` TestExecutor runs them
   with full parallel execution support.

6. **Package location**: A new package `core/blong-cucumber` following the
   same pattern as `core/blong-eip` — self-contained with its own test suite.

### Technology Choices

- **Parser**: Lightweight custom Gherkin parser (supports Feature, Scenario,
  Scenario Outline, Given/When/Then/And/But/*, Examples tables, Tags, Doc
  Strings, Data Tables). Optionally, `@cucumber/gherkin` for full compliance.
- **Step matching**: Cucumber expression-style parameter types (`{int}`,
  `{float}`, `{word}`, `{string}`, `{}`) with regex fallback.
- **Runtime**: Zero new runtime dependencies beyond `@feasibleone/blong`.

## Implementation Plan

### Phase 1: Documentation Enhancement (Small)

**Goal**: Update docs and skills to properly illustrate test handler reuse
with arbitrary parameters.

#### Task 1.1: Update test pattern docs

**File**: `docs/blong/docs/patterns/test.md`
**Complexity**: Small

Add a new section "Reusing Test Handlers with Parameters" that shows:

- How to define test handlers with custom parameters beyond `name`
- How to call reusable test handlers from other test handlers, passing
  different parameter values
- How parameters flow through the `group(name)([...steps])` pattern
- Example: a `testTransfer` handler that accepts `{name, amount, currency}`
  and is called from `testScenario` with different parameter combinations

#### Task 1.2: Update blong-test skill

**File**: `.github/skills/blong-test/SKILL.md`
**Complexity**: Small

Expand the "Reusing Test Handlers" section with:

- Explicit examples showing arbitrary parameters
- A pattern for composing tests from parameterized handlers
- Cross-reference to the new docs section

#### Task 1.3: Add reuse example to core/test/demo

**Files**: `core/test/demo/test/test/testNumberSumReuse.ts` (new)
**Complexity**: Small

Create a concrete example that reuses `testNumberSum` with different
parameters, demonstrating the parameterized reuse pattern in actual
runnable code.

### Phase 2: Gherkin Parser Library (Medium)

**Goal**: Implement a lightweight Gherkin parser as library functions in the
new `blong-cucumber` package.

#### Task 2.1: Create blong-cucumber package scaffold

**Files**: New package `core/blong-cucumber/`
**Complexity**: Small

- `package.json` — `@feasibleone/blong-cucumber`
- `server.ts` — realm definition
- `tsconfig.json` — standard config
- Register in `rush.json`

#### Task 2.2: Implement Gherkin parser

**Files**: `core/blong-cucumber/library/`
**Complexity**: Medium

Library functions:

- `parseGherkin(source: string)` — parses Gherkin text into AST:
  ```typescript
  interface IGherkinFeature {
      name: string;
      tags: string[];
      scenarios: IGherkinScenario[];
  }
  interface IGherkinScenario {
      name: string;
      tags: string[];
      steps: IGherkinStep[];
      examples?: IGherkinExamples[];  // For Scenario Outline
  }
  interface IGherkinStep {
      keyword: 'Given' | 'When' | 'Then' | 'And' | 'But' | '*';
      text: string;
      dataTable?: string[][];
      docString?: string;
  }
  interface IGherkinExamples {
      name?: string;
      tags?: string[];
      headers: string[];
      rows: string[][];
  }
  ```
- `parseStep(text: string, patterns: IStepPattern[])` — matches step text
  against registered patterns, extracts parameters
- `expandOutline(scenario: IGherkinScenario)` — expands Scenario Outline
  with Examples table into concrete scenarios

#### Task 2.3: Implement step matcher

**Files**: `core/blong-cucumber/library/`
**Complexity**: Medium

- `matchStep(stepText: string, patterns: Map<RegExp, string>)` — finds the
  matching step definition handler name
- Support cucumber expression parameter types:
  - `{int}` → integer
  - `{float}` → float
  - `{word}` → single word
  - `{string}` → quoted string
  - `{}` → arbitrary text
- Convert cucumber expressions to RegExp for matching

#### Task 2.4: Unit tests for parser

**Files**: `core/blong-cucumber/index.test.ts`
**Complexity**: Small

Test the parser with various Gherkin inputs:

- Simple Feature/Scenario
- Scenario Outline with Examples
- Tags, DataTables, DocStrings
- Step parameter extraction

### Phase 3: Test Array Generator (Medium)

**Goal**: Convert parsed Gherkin into blong-compatible `ChainStep[]` arrays
that the existing test runner can execute.

#### Task 3.1: Feature-to-steps converter

**Files**: `core/blong-cucumber/library/`
**Complexity**: Medium

Library function `featureToSteps(feature: IGherkinFeature, stepDefs: IStepDefinitions)`:

- Takes a parsed Gherkin feature and a map of step definitions
- Each Scenario becomes a named group: `group(scenarioName)([...steps])`
- Each step within a scenario calls the matched handler with extracted params
- The Feature itself becomes an outer group containing all scenario groups
- Scenario Outlines produce one group per Examples row

Step definitions interface:

```typescript
interface IStepDefinitions {
    patterns: Map<string | RegExp, string>;  // pattern → handlerName
}
```

#### Task 3.2: Integration with `group` function

**Files**: `core/blong-cucumber/library/`
**Complexity**: Small

- Wire the converter to use `lib.group` for naming
- Ensure generated step arrays are compatible with `ChainStep[]` type
- Handle Background sections (prepended to each scenario)

#### Task 3.3: Feature handler factory

**Files**: `core/blong-cucumber/library/`
**Complexity**: Small

A handler factory that creates a test handler from a Gherkin feature:

```typescript
// Usage in a test handler file
export default handler(({lib: {group, featureToSteps}, handler}) => ({
    testLogin: ({name = 'login'}, $meta) =>
        featureToSteps(loginFeature, {
            'generate admin user': () => handler.testGenerateAdmin({}, $meta),
            'login admin user': () => handler.testLoginAdmin({}, $meta),
            'get admin details': () => handler.testGetAdminDetails({}, $meta),
        }, {name, $meta}),
}));
```

### Phase 4: Example Suite (Medium)

**Goal**: Create a working example suite that demonstrates cucumber-style
testing end-to-end.

#### Task 4.1: Example feature files

**Files**: `core/blong-cucumber/example/test/feature/`
**Complexity**: Small

Create Gherkin feature files:

- `calculator.feature` — arithmetic operations (ties to demo realm's
  `subjectNumberSum`)
- `login.feature` — authentication flow (mirrors existing
  `core/test/demo/test/feature/login.ts`)

#### Task 4.2: Step definition handlers

**Files**: `core/blong-cucumber/example/test/step/`
**Complexity**: Small

Implement step definitions as blong handlers:

- `stepCalculator.ts` — Given/When/Then for calculator operations
- `stepLogin.ts` — Given/When/Then for login flow

Each step definition handler is a regular handler that accepts Gherkin-
extracted parameters.

#### Task 4.3: Feature test handlers

**Files**: `core/blong-cucumber/example/test/test/`
**Complexity**: Small

Test handlers that wire features to step definitions:

- `testCalculator.ts` — loads calculator.feature, maps steps, runs
- `testLogin.ts` — loads login.feature, maps steps, runs

#### Task 4.4: Example suite entry points

**Files**: `core/blong-cucumber/example/`
**Complexity**: Small

- `server.ts` — example realm with demo orchestrator
- `index.ts` — test runner entry point
- `index.test.ts` — tap-wrapped test entry for CI

#### Task 4.5: Integration test

**File**: `core/blong-cucumber/index.test.ts`
**Complexity**: Small

End-to-end test that:

1. Parses a Gherkin feature
2. Maps steps to handlers
3. Executes via blong-chain
4. Verifies all steps pass

### Phase 5: Wire Feature/Step in Framework (Small)

**Goal**: Activate the existing `ModuleApi.feature()` and `ModuleApi.step()`
stubs so that feature files in test folders are automatically discovered.

#### Task 5.1: Implement feature() in layerProxy

**File**: `core/blong-gogo/src/layerProxy.ts`
**Complexity**: Medium

Replace the no-op `feature() {}` with logic that:

- Accepts feature file paths (strings or template literals)
- Stores them for the test layer to consume
- Makes them available via `lib.features` or similar

#### Task 5.2: Implement step() in layer loading

**File**: `core/blong-gogo/src/layerProxy.ts` or `Watch.ts`
**Complexity**: Small

- Register step definitions that map Gherkin text to handler names
- Make step definitions available to the feature-to-steps converter

### Phase 6: Documentation & Skill Updates (Small)

**Goal**: Complete documentation for cucumber support.

#### Task 6.1: Concept doc

**File**: `docs/blong/docs/patterns/cucumber.md` (new)
**Complexity**: Small

Document:

- What cucumber/Gherkin testing is and why it's useful
- How it integrates with blong test handlers
- Feature file format
- Step definition patterns
- Scenario Outline / Examples
- Running cucumber tests

#### Task 6.2: Create blong-cucumber skill

**File**: `.github/skills/blong-cucumber/SKILL.md` (new)
**Complexity**: Small

AI skill for guiding cucumber test implementation.

#### Task 6.3: Update blong-test skill

**File**: `.github/skills/blong-test/SKILL.md`
**Complexity**: Small

Add cross-reference to cucumber support for BDD-style testing.

## Considerations

### Assumptions

- The existing `blong-chain` TestExecutor is sufficient for running
  cucumber-generated test arrays — no modifications needed.
- The lightweight custom parser covers the Gherkin subset commonly used
  (Feature, Scenario, Scenario Outline, Given/When/Then, Examples, Tags).
  Full Gherkin spec compliance (Rule, Background with data tables, etc.)
  can come later.
- The existing `core/test/demo/test/feature/` files demonstrate the intended
  pattern for feature files as template literal exports.

### Constraints

- **Zero new runtime dependencies** for the parser (aligns with framework
  philosophy). `@cucumber/gherkin` is optional.
- **No breaking changes** to existing test patterns.
- **ESM-only** — all new code uses ESM modules.
- **Existing tests pass** — the new package is additive.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gherkin parsing edge cases | Medium | Low | Start with subset, add features iteratively |
| Step matching ambiguity | Low | Medium | Clear step naming conventions, order-dependent matching |
| Integration complexity with layerProxy | Medium | Medium | Phase 5 is optional; tests work without framework auto-discovery |

### Dependencies Between Phases

```
Phase 1 (Docs)      ──────────────────────────┐
                                               │
Phase 2 (Parser) ──→ Phase 3 (Generator) ──→ Phase 4 (Example) ──→ Phase 6 (Final Docs)
                                               │
Phase 5 (Framework wire) ─────────────────────┘
```

Phase 1 is independent and can be done first.
Phases 2-3 are the core technical work.
Phase 4 validates the implementation.
Phase 5 is optional polish (framework-level auto-discovery).
Phase 6 finalizes documentation.

## Not Included

- **Full Gherkin spec**: Rule keyword, complex Background patterns, i18n
  keywords — can be added later.
- **Visual Studio Code extension**: Gherkin syntax highlighting for `.ts`
  feature files.
- **cucumber-js compatibility layer**: Running existing cucumber-js step
  definitions without modification.
- **Allure reporting integration**: The existing blong-allure package can
  consume the test results, but specific cucumber-to-Allure feature mapping
  is out of scope.
- **Browser-side cucumber**: Initially server-only; browser support follows
  naturally once server patterns are established.
