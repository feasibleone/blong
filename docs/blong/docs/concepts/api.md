# API

The framework works with several API concepts, which are used in different contexts and have different purposes. These are:

## Gateway API

The API exposed by the gateway layer, which is the public facing interface of the server.
It can be exposed as JSON-RPC or REST endpoints.

See [gateway](./gateway.md) for more information.

## Internal API

This is the API, which handlers use to call each other or to be called from the gateway.
The internal API is the backbone and **lingua franca** of the framework, as it is used for all interactions between the
components of the framework. It is:

- The native language of all the [orchestrators](./orchestrator.md)
- The language to and from which the [adapters](./adapter.md) translate the external API calls

A basic pattern for the internal API is the naming convention for the API:

- **Methods names**: uses a semantic triple for them: `subjectObjectPredicate`. The framework also makes some
  assumptions about the predicate, with the following being the most common ones:
  - `get` - gets a single entity by some unique identifier
  - `find` - return a list of entities, with some filtering and pagination
  - `add` - creates a single entity
  - `edit` - modifies a single entity
  - `remove` - deletes a single entity
  - `merge` - creates or modifies a single entity, depending on whether it already exists or not
  - `insert` - creates multiple entities
  - `update` - modifies multiple entities
  - `delete` - deletes multiple entities
- **Property names**: prefer the usage of two words, to avoid ambiguity. This helps in multiple cases,
  for example in SQL joins, search in the codebase, etc. For example:
  - `userName` is better than `name`
  - `firstName`, `lastName`, `fullName` are better than `name`
  - `customerId` is better than `id`
  - `emailAddress` is better than `email`

See the [handler pattern](../patterns/handler.md) and [validation](../patterns/validation.md) for more information.

## RPC API

By default the internal API is exposed as JSON-RPC endpoints at two places:

- the external gateway, to be consumed by the clients
- internal inter-process framework calls, which facilitates the communication between the microservices,
  when the framework is used in a microservice architecture

See the [RPC pattern](../patterns/rpc.md) for more information.

## Open API

The support for the official OpenAPI standard is a significant part of the framework. Implementing
or calling APIs is very easy when an API definition is available. Third-party
definition files can be left in original format, while extra information is
merged to them to enable easier usage or implementation.

To align the Open API definitions to the internal API, the framework uses the `operationId` field in the OpenAPI
definition.

When implementing new APIs, the operationId matches the internal API conventions in the following way:

- the definition itself contains the object and predicate of the semantic triple, for example `userAdd`
- the subject is determined when the Open API is bound to some namespace, for example `user`, and then the full
  operationId becomes `userUserAdd`

When implementing or integrating with existing APIs, a special extension property `x-blong-method` is used
to specify the object and predicate of the semantic triple, for example:

```yaml
paths:
  /user:
    post:
      x-blong-method: userAdd
```

To learn how to expose or consume OpenAPI, read the [rest pattern](../patterns/rest.md).
