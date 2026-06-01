# @feasibleone/blong-eip

Reference implementation of [Enterprise Integration Patterns](https://www.enterpriseintegrationpatterns.com/)
using the Blong framework, demonstrating how real-world EIP patterns map to framework handlers.

## Purpose

This package serves two purposes:

1. **Learning resource** – Each EIP pattern is implemented as a single, self-contained handler so
   developers can read the code alongside the canonical pattern descriptions.
2. **Pattern template** – The `test` layer shows the recommended approach for server-side testing
   with mock handlers instead of real external systems.

## Patterns implemented

| Handler | EIP Pattern |
|---|---|
| `eipMessageReturn` | Request–Reply |
| `eipMessagePipes` | Pipes and Filters |
| `eipMessageRoute` | Content-Based Router |
| `eipMessageDynamic` | Dynamic Router |
| `eipMessageFilter` | Message Filter |
| `eipMessageRecipient` | Recipient List |
| `eipMessageSplit` | Splitter |
| `eipMessageAggregate` | Aggregator |
| `eipMessageSort` | Resequencer |
| `eipMessageCompose` | Composed Message Processor |
| `eipMessageScatter` | Scatter-Gather |
| `eipMessageWrap` | Envelope Wrapper |
| `eipMessageEnrich` | Content Enricher |
| `eipMessageSimplify` | Content Filter |
| `eipMessageClaim` | Claim Check |
| `eipMessageNormalize` | Normalizer |

## Package structure

```text
blong-eip/
├── eip/                         # Child realm "@feasibleone/blong-eip"
│   ├── server.ts                # Server-side realm entry (activates orchestrator + test layers)
│   ├── browser.ts               # Browser-side realm entry
│   ├── orchestrator/
│   │   ├── eipDispatch.ts       # Dispatch orchestrator for the "eip" namespace
│   │   └── eip/                 # Handler group "eip.eip" – the pattern implementations
│   │       ├── ~.schema.ts      # TypeBox validation & IRemoteHandler type augmentation
│   │       ├── eipMessageReturn.ts
│   │       ├── eipMessagePipes.ts
│   │       └── ...              # One file per pattern
│   └── test/                    # Test layer (activated only in "integration" mode)
│       ├── mockDispatch.ts      # Dispatch orchestrator for the "mock" namespace
│       ├── testDispatch.ts      # Dispatch orchestrator for the "test" namespace
│       ├── mock/                # Handler group "eip.mock" – mock dependencies
│       │   ├── ~.schema.ts
│       │   ├── mockPipeA.ts
│       │   ├── mockPipeB.ts
│       │   ├── mockPipeC.ts
│       │   ├── mockItemProcess.ts
│       │   ├── mockDataEnrich.ts
│       │   ├── mockDataSave.ts
│       │   └── mockDataGet.ts
│       └── test/                # Handler group "eip.test" – test scenarios
│           ├── testEipReturn.ts
│           ├── testEipPipes.ts
│           └── ...              # One file per pattern
├── server.ts                    # Root server entry (loads ./eip child realm)
├── index.ts                     # Entrypoint used by external callers
└── index.test.ts                # tap test runner
```

## Running the tests

```bash
npm run ci-test
```

The test runner loads the server realm with the `integration` configuration active,
which enables the `test` layer.  The test layer brings up both `mockDispatch` (serving
mock handlers that simulate external dependencies) and `testDispatch` (serving test
handlers that exercise the EIP pattern handlers).

Because `remote.canSkipSocket: true` is set for the `integration` intent,
all cross-namespace calls stay in-process – no HTTP or RPC transport is needed.

## Key design decisions

### Mock handlers live in the test layer

External dependencies (a data store, a downstream service, a transformation service)
are replaced by simple mock handlers in `test/mock/`.  These handlers are activated
only in `integration` mode and are never shipped in production.

### `mockDispatch` and `testDispatch` in the same layer

Both orchestrators live in `test/` next to the mock and test handler folders.
`mockDispatch` exposes the `mock` namespace, while `testDispatch` exposes the `test`
namespace.  The EIP handlers themselves live in the `orchestrator` layer and are
unaware of which implementation they call – in production you swap in a real
adapter, in tests you swap in a mock handler.

### `canSkipSocket` for fully in-process integration tests

By default `remote: { canSkipSocket: true }` is set for the `integration` intent,
which lets the framework bypass the RPC transport layer entirely.  All handler calls
(`eip.*`, `mock.*`, `test.*`) resolve through the in-process local registry,
making the test suite fast and dependency-free.

## References

- [Enterprise Integration Patterns book](https://www.enterpriseintegrationpatterns.com/)
- [ut-port-script readme](https://github.com/softwaregroup-bg/ut-port-script) – original EIP examples
- [blong-eip skill](../../.github/skills/blong-eip/SKILL.md) – how to implement EIP handlers
- [blong-mock-test skill](../../.github/skills/blong-mock-test/SKILL.md) – server-side testing with mocks
