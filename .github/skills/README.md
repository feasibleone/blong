# Blong Framework Agent Skills

A collection of Agent Skills for implementing components in the Blong TypeScript API framework. These skills follow the [Agent Skills specification](https://agentskills.io/specification) and provide step-by-step guidance for AI agents working with the framework.

## Available Skills

### Core Architecture

- **[blong-realm](./realm/)** - Create business domain boundaries with deployment flexibility
- **[blong-layer](./layer/)** - Organize handlers into functional groups (gateway, adapter, orchestrator, error, test)
- **[blong-orchestrator](./orchestrator/)** - Implement business logic coordination and workflows
- **[blong-adapter](./adapter/)** - Integrate with external systems (HTTP, TCP, SQL, webhooks)
- **[blong-codec](./codec/)** - Implement protocols (OpenAPI, JSON-RPC, MLE, TCP codecs)

### API Patterns

- **[blong-rest](./rest/)** - Implement REST APIs using OpenAPI/Swagger definitions (server & client)

### Implementation Patterns

- **[blong-handler](./handler/)** - Create API handlers and library functions with semantic triple naming
- **[blong-error](./error/)** - Define and throw typed errors with parameterized messages
- **[blong-test](./test/)** - Write automated tests with context passing and assertions
- **[blong-validation](./validation/)** - Define input/output validation and generate OpenAPI docs

## Quick Reference

| Task | Skill |
|------|-------|
| Create a new business domain | [blong-realm](./realm/) |
| Organize handlers by concern | [blong-layer](./layer/) |
| Implement business logic | [blong-orchestrator](./orchestrator/) |
| Integrate external system | [blong-adapter](./adapter/) |
| Implement a protocol | [blong-codec](./codec/) |
| Implement REST API from OpenAPI | [blong-rest](./rest/) |
| Create an API handler | [blong-handler](./handler/) |
| Define typed errors | [blong-error](./error/) |
| Write automated tests | [blong-test](./test/) |
| Add parameter validation | [blong-validation](./validation/) |

## Framework Overview

**Blong** is a TypeScript-based API-focused RAD framework built as a Rush.js monorepo. Key features:

- **"Bring Your Own Architecture":** Deploy as modular monolith, microservices, or hybrid
- **Realm-Based Modularity:** Business logic separated into independent domains
- **Semantic Triple Naming:** Handlers follow `subjectObjectPredicate` pattern
- **Type-Safe:** Automatic validation from TypeScript types
- **Test-Driven:** Fast reload, hot module replacement, 100% test coverage goal
- **Cloud-Native:** Kubernetes-ready, supports multiple deployment patterns

### Core Concepts

**Realms** are business domain boundaries that can be deployed independently. Each realm contains:

- **Layers** - Functional groups: gateway (API), adapter (integration), orchestrator (business logic), error, test
- **Handlers** - Functions implementing specific operations using semantic triple naming
- **Configuration** - Environment-specific settings (dev, prod, test, microservice)

**Example Structure:**

```
payment/                      # Realm (business domain)
├── server.ts                 # Realm definition
├── error/error.ts            # Domain errors
├── adapter/                  # Integration layer
│   ├── db.ts                # Database adapter
│   └── fspiop.ts            # External API adapter
├── orchestrator/             # Business logic layer
│   ├── paymentDispatch.ts   # Orchestrator
│   └── transfer/            # Handler group
│       ├── paymentTransferPrepare.ts
│       └── paymentTransferCommit.ts
├── gateway/                  # API layer
│   └── api/
│       └── transfer.yaml    # OpenAPI spec
└── test/                     # Test layer
    └── test/
        └── testTransfer.ts  # Automated tests
```

## Deployment Modes

Same codebase supports multiple architectures:

- **Modular Monolith** (dev): All realms in single process
- **Microservices** (prod): Each realm/layer as Kubernetes service
- **Hybrid**: Mix based on requirements

Configuration activations:

- `default` - Base configuration (always active)
- `dev` - Development environment
- `prod` - Production/UAT environments
- `test` - Automated testing
- `microservice` - Microservice deployment mode
- `realm` - Single realm development focus

## Using These Skills

### For AI Agents

Each skill directory contains a `SKILL.md` file with:

1. **YAML Frontmatter** - Name, description, and metadata
2. **Step-by-Step Instructions** - How to implement the component
3. **Complete Examples** - Working code from the codebase
4. **Best Practices** - Dos and don'ts
5. **Configuration Patterns** - Exact schemas

Agents load skills based on the task and user's request.

### For Developers

Browse the skill directories to learn implementation patterns:

1. Read the `SKILL.md` file for comprehensive guidance
2. Follow the examples from the actual codebase
3. Use the configuration patterns as templates
4. Apply the best practices in your implementations

### Progressive Disclosure

Skills are designed for efficient context usage:

- **Metadata** (~100 tokens): Name and description in frontmatter
- **Instructions** (<5000 tokens): Main SKILL.md content
- **Resources** (as needed): Additional files in `references/` (future)

## Semantic Triple Naming

Handlers use `subjectObjectPredicate` format:

- `subject` = namespace/realm name
- `object` = entity within realm
- `predicate` = action on entity

**Examples:**

- `userUserAdd` - Create a user in user realm
- `paymentTransferPrepare` - Prepare transfer in payment realm
- `mathNumberSum` - Sum numbers in math realm

## Validation

These skills conform to the [Agent Skills specification v1.0](https://agentskills.io/specification).

To validate (requires [skills-ref](https://github.com/agentskills/agentskills)):

```bash
skills-ref validate .github/copilot-skills/realm
skills-ref validate .github/copilot-skills/adapter
# ... etc
```

## Framework Documentation

- Framework docs: `docs/blong/docs/`
- Example implementations: `core/test/`
- Production realms: `ml/` and `tools/`

## Contributing

When updating skills:

1. Follow Agent Skills specification format
2. Keep SKILL.md focused (<500 lines recommended)
3. Include complete, working code examples
4. Update frontmatter description if scope changes
5. Test patterns against framework

## License

These skills document the Blong framework. See framework license for terms.

## Version

Skills updated for Blong framework as of January 2026.
Specification: [Agent Skills v1.0](https://agentskills.io/specification)
