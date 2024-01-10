# Definitions

We will use the following definitions:

* `Microservice` - A buzzword, referring to the deployment of a modular
  application server middleware, which is using service oriented
  architecture (SOA). In this framework, we are not targeting only
  server side middleware. The same principles can apply for a much bigger
  domain of software. When mentioning microservice in this framework,
  we mean the server side process that runs specific part of the middleware.

* `Business logic` - the primary functionality of the system, which
  defines how it solves the business's use cases.

* `Data integrity logic` - the part of the business logic, which ensures that
  data is persisted in an atomic and logically correct way. A common place
  to find such logic is in a database stored procedure.

* `Business process` / `workflow` - part of the business logic, that operates
  on top of the `data integrity logic` and coordinates it. Note that there is
  no strict boundary between the `business process` and the `data integrity logic`,
  but often the `data integrity logic` does not change between applications,
  while the `business process` is more varying. Business processes are often
  placed in the orchestrator layer.

* `Platform` - the platform that is going to run the software.
  Although primary focus will be `server`, same concepts can be applied for
  other platforms:
  * `desktop` - Desktop application
  * `browser` - Browser base application
  * `mobile` - Mobile application

* `Modular approach` - allow solutions to be created by combining
  functionality of several `realms`, while keeping maximum isolation
  between them.

* [Realm](./realm.md) - this is a grouping of `layers`, as an
  individual development unit, often focused on full implementation of closely
  related functionality. Each realm is usually developed in a
  separate folder and all layers are released and versioned together.
  Examples are:
  * `loan realm` - a module for handling a Loan lifecycle
  * `transfer realm` - a module for handling electronic funds transfers

* [Layer](./layer.md) - this is partial functionality of certain `realm`,
  usually relating to some architectural layers (like database, front-end, etc.)
  or functional aspect(like transaction processing, reporting, etc.).

:::note
  The primary goal of the `layers` is to name a set of `handlers`,
  which usually run in one microservice.
  By grouping them, it is easier to run them together.
:::

* `Handlers` - individual functions, usually grouped by their role, for example:
  validations, error definitions, database schema, etc. These handlers are often
  named in the form `subjectObjectPredicate`, to allow for name-spacing between realms,
  `subject` being the namespace.
