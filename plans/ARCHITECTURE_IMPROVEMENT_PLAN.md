# Blong Architecture Improvement Plan

## Scope Exclusions

| Item | Reason |
|------|--------|
| **blong-ui** | Not yet complete — tracked in a separate plan (`plans/ui/BLONG_UI_IMPLEMENTATION_PLAN.md`) |
| **Configuration loading** | Already implemented — adapters and handler folders support co-located `config.ts` with activation-based environments (`default`, `dev`, `integration`, etc.) via `Watch.ts` |

---

## 1. OpenAPI Framework Registration (Highest Priority)

### Background

OpenAPI spec files (`.yaml`) are **deliberately** kept separate from handler code. The design intent is to register them as first-class framework resources and reuse a single spec across multiple consumers:

- **Codecs** — serialization/deserialization of wire messages
- **Adapters** — client-side HTTP request generation
- **Mocks / simulators** — test double generation for `blong-sim-api`

This is intentional but not yet fully implemented.

### Current State

What exists today:

- `core/blong-openapi/` — package providing the integration layer
- `core/blong-gogo/src/codec/adapter/openapi/` — loads specs and generates request handlers; supports Swagger 2.0 and OpenAPI 3.0+
- `core/blong-ttk/mojaloop/api/` — FSPIOP + Admin specs with `x-blong-method` extension mapping operations to semantic triples (`transferTransferCreate`, `quoteQuoteCreate`, etc.)
- `core/blong-sim-api/time/api/` — World Time API spec used by the API simulator

The `x-blong-method` extension in `operations.yaml` files already handles semantic triple mapping.

### What Is Missing

1. **Registry API** — No framework-level mechanism to register a spec by name/version so it can be resolved by reference from any consumer (codec, adapter, mock).
2. **Adapter-side reuse** — Adapters that call external REST services must currently load their spec directly. A registry would let the adapter reference a pre-loaded, validated spec.
3. **Mock auto-generation** — `blong-sim-api` simulates backends based on OpenAPI specs. Currently each simulator loads its spec independently. A registry would allow the mock to reference the same spec as the adapter under test, guaranteeing contract alignment.
4. **Validation handler generation** — TypeBox `~.schema.ts` files are the current validation mechanism. OpenAPI schemas could auto-generate these, removing duplication between the spec and the schema files.

### Proposed Work

1. **Registry API in `blong-openapi`**
   - Define a `registerSpec(name, version, specOrPath)` function
   - Define a `resolveSpec(name, version?)` function
   - Support both pre-loaded spec objects and lazy file-path loading
   - Store registry in framework-level context so all layers can access it

2. **Codec integration**
   - Update `blong-gogo` codec `load.ts` to resolve specs from the registry by name instead of direct file import
   - Keep backward compatibility for inline spec loading

3. **Adapter integration**
   - Allow adapters to reference a registered spec via config (`openapi: {spec: 'fspiop', version: '1.1'}`)
   - Auto-generate request/response TypeScript types from the spec at load time

4. **Mock integration**
   - Allow `blong-sim-api` simulators to reference a registered spec
   - Auto-generate response stubs from spec examples or schema defaults

5. **Documentation**
   - Add `docs/blong/docs/concepts/openapi.md` section describing the registry pattern and reuse across codec/adapter/mock
   - Add a `plans/openapi/` plan doc detailing the phased implementation

---

## 2. Test Coverage Gaps

### Current State

**Packages with no test files:**

| Package | Role | Risk |
|---------|------|------|
| `blong-openapi` | OpenAPI integration layer | High — central to item 1 above |
| `blong-config` | Configuration management | Medium — foundational utility |
| `blong-login` | JWT authentication | Medium — security-critical |
| `blong-kopi` | Utility package | Low |
| `blong` (core) | Framework types/utilities | Tested transitively via `core/test` |

**Packages with adequate tests:** `blong-chain` (5), `blong-gogo` (3), `blong-log` (3), `blong-ttk` (3), `blong-allure`, `blong-eip`, `blong-int-sql`, `blong-sim-api`, `blong-sim-tcp`, `blong-graph` (1 each).

### Proposed Work

1. Add TAP-based unit tests to `blong-openapi` — especially spec loading, registry lookup, and error paths. This is prerequisite to item 1 above.
2. Add tests to `blong-config` covering config merge, environment variant selection, and TypeBox validation.
3. Add tests to `blong-login` covering token creation, validation, and refresh flows.
4. Verify that `blong` core types are adequately covered by transitive tests in `core/test` — document the testing strategy if so.

---

## 3. TypeScript Strictness Standardization

### Current State

- **Strict mode enabled** (11 packages): `blong-allure`, `blong-eip`, `blong-int-sql`, `blong-kopi`, `blong-login`, `blong-openapi`, `blong-sim-api`, `blong-sim-tcp`, `blong-test`, `blong-ttk`
- **Strict mode missing** (6 packages): `blong-chain`, `blong-config`, `blong-gogo`, `blong-graph`, `blong-log`, `core/test`

Additionally, there are two intentional module resolution strategies:

| Strategy | Packages | When to use |
|----------|----------|-------------|
| `NodeNext` | `blong`, `blong-chain` | Published packages with `.js` extension imports |
| `bundler` + `noEmit` | `blong-gogo`, `blong-eip`, `blong-log` | Source-only packages loaded at runtime without a build step |

No shared `tsconfig.base.json` exists — each package defines its own from scratch.

### Proposed Work

1. Create `tsconfig.base.json` at the repo root capturing shared options (`target: ES2022`, `lib`, `jsx`, `sourceMap`, etc.)
2. Enable `strict: true` progressively, starting with smaller packages: `blong-config` → `blong-graph` → `blong-chain`
3. `blong-gogo` (the largest package, 72 files) will require a dedicated pass to fix strict-mode type errors
4. Document the two module resolution strategies in a root `tsconfig.base.json` comment or `docs/blong/docs/patterns/configuration.md`

---

## 4. ESLint Configuration Gaps

### Current State

Only 5 of 17 packages have a local `.eslintrc.config.cjs`:
`blong-gogo`, `blong-graph`, `blong-ui` (excluded), `ui-demo`, `core/test`

The remaining 12 packages rely on `@rushstack/heft-lint-plugin` with no local config override.

### Proposed Work

1. Verify whether the heft lint plugin resolves a root-level eslint config (Rush discourages this but it may work for fallback rules)
2. Add `.eslintrc.config.cjs` to packages that need custom rules (e.g., `no-console`, `eqeqeq`)
3. Document which packages intentionally use only the Rush defaults vs which need local overrides

---

## 5. Documentation Gaps

### Well-Documented Areas

Concepts, patterns, and rationale docs exist for: architecture, adapters, codecs, configuration, EIP, errors, gateways, handlers, orchestrators, realms, REST, RPC, suites, testing, validation, watch/reload.

### Missing Package-Level Documentation

| Package | Gap |
|---------|-----|
| `blong-chain` | Parallel test execution model, auto-dependency detection |
| `blong-login` | JWT auth flow, token lifecycle, Keycloak integration |
| `blong-allure` | Allure 3 reporting setup (plan docs exist in `plans/ttk/` but no concept doc) |
| `blong-graph` | Graph visualization for runtime inspection |
| `blong-int-sql` | SQL integration testing with Kubernetes MySQL backend |
| `blong-kopi` | No description even in `package.json` |
| `blong-sim-api` / `blong-sim-tcp` | API and TCP simulation setup |

### Proposed Work

1. Add `description` to `blong-kopi/package.json`
2. Add concept docs for `blong-chain` and `blong-login` (used widely across packages)
3. Add a `docs/blong/docs/packages/` section with brief guides for simulator and integration packages
4. Move `plans/ttk/` Allure content into a proper concept doc at `docs/blong/docs/concepts/allure.md`

---

## 6. CI/CD Improvements

### Current State

Two workflows delegate to shared `infitx-org/actions`:
- `build.yaml` — triggers on PR to `main`; runs Rush build + Chromatic visual tests
- `release.yaml` — triggers on push to `main`; publishes packages

Observations:
- No test coverage reporting or badges
- Integration tests (`blong-int-sql`) require Kubernetes (k3d) — unclear whether they run in CI or are manual-only
- No build status badge on root `README.md`

### Proposed Work

1. Add TAP coverage reporting to the CI build (TAP supports `--coverage` natively)
2. Verify whether `ci-integration` scripts run in CI (check `infitx-org/actions/rush.yaml` for k3d setup) and document
3. Add build status + npm version badges to `README.md`

---

## 7. Release Process Alignment

### Current State

`release-please-config.json` tracks 18 packages. The `.release-please-manifest.json` contains version entries for all of them including `core/ui-demo` (version `1.0.0` after the recent move from `dev/ui-demo`).

The `ui-demo` entry in `rush.json` still carries `"tag": "dev"` which may be incorrect now that the package has moved to `core/`.

### Proposed Work

1. Verify and update `rush.json` tag for `core/ui-demo` (`"tag": "dev"` → `"tag": "core"` if appropriate)
2. Confirm `.release-please-manifest.json` entry is consistent after the move

---

## Priority Order

| # | Area | Rationale |
|---|------|-----------|
| 1 | **OpenAPI registry** (§1) | Highest strategic value; unblocks spec reuse across codecs, adapters, and mocks |
| 2 | **Test coverage** (§2) | `blong-openapi` tests are prerequisite to safe registry implementation |
| 3 | **TypeScript strictness** (§3) | Shared base config reduces boilerplate; strict mode prevents entire classes of bugs |
| 4 | **Documentation** (§5) | `blong-chain` and `blong-login` docs benefit daily development |
| 5 | **ESLint** (§4) | Verify heft behavior first; may be a no-op for most packages |
| 6 | **CI/CD** (§6) | Coverage reporting improves feedback loop |
| 7 | **Release alignment** (§7) | Quick housekeeping, low risk |
