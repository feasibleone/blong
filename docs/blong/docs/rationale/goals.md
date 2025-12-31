# Goals

## Primary goal

The primary goal of the framework is to  decrease the cost of developing and
running solutions by:

- Minimizing the development effort - test driven development with less restarts
  and fast load times
- Easier learning curve - minimal concepts to learn as the framework exposes a
  minimal API
- Faster build and deploy cycles - the framework more like a runtime, available
  in a base image or a single dependency
- Having a 100% test coverage

## Approach

To achieve the primary goal, it assumes some approach for the architecture:

- Modular architecture - allows for easy reuse, where common tasks are
  implemented once, in a single well defined place.
- Microservices - the runtime aspect of the modular architecture enabled by the
  framework. The same codebase can run as a modular monolith during development
  or deployed as microservices in production.
- Multiple runtimes - the main targets being web browser and node.js

Further, it enables developers to write less code in a way, which is predictable,
testable and understandable by others:

- Structure: code is structured in well defined places
- Naming conventions: code uses well defined naming conventions
- Type checking: code is type checked by TypeScript
- Integrations: it provides recommended architecture to abstract integrations or
  system level functionality, so that business logic does not get coupled with
  integration protocols, frameworks and platforms.
- Deployment: be cloud native friendly - see [cncf.io](https://cncf.io)

## Non-goals

The framework only solves tasks that repeat often and solves them as much as
possible within the framework. It does not aim to:

- Solve every complex business problem for you
- Make complex problems easier
- Be the easiest solution for every problem
- Be the fastest way to achieve a POC for every problem

Instead, in the hands of knowledgeable, it could make all the above feasible to
achieve and maintain in the long run.
