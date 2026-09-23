# Dependencies

Blong is built on top of other great open source packages:

- [fastify](https://fastify.dev/) - fast and low overhead web framework for Node.js.
- [knex](https://knexjs.org/) - SQL query builder, used by the declarative schema layer and the
  generic CRUD of `adapter.knex`.
- [pino](https://getpino.io) - very low overhead Node.js logger.
- [TypeBox](https://github.com/sinclairzx81/typebox) - JSON Schema Type Builder with Static Type
  Resolution for TypeScript.
- [p-queue](https://github.com/sindresorhus/p-queue) - Promise queue with concurrency control.
- [got](https://github.com/sindresorhus/got) - Human-friendly and powerful HTTP request library for
  Node.js.
- [ky](https://github.com/sindresorhus/ky) - Tiny & elegant JavaScript HTTP client based on the
  browser Fetch API.
- [Rush Stack](https://rushstack.io) - Reusable tech for running large scale monorepos for the web.
- [jose](https://github.com/panva/jose) - JavaScript module for JSON Object Signing and Encryption.
- [tap](https://node-tap.org/) - A Test-Anything-Protocol library for JavaScript.
- [ut-bitsyntax](https://github.com/softwaregroup-bg/ut-bitsyntax) - Serialization and
  deserialization based on patterns, used by the runtime and the framework tests.
- [ut-function.\*](https://github.com/softwaregroup-bg/ut-function) - Reusable functions.

One more is a Blong package rather than a third-party one:
[semantic-log](../patterns/semantic-log.md) records the flows the framework executes, and it is what
the docs' generated sequence diagrams are built from.
