# Layer

Layers are named groups of handlers. The names of layers can be arbitrary
(though must be valid identifiers), but it is recommended single
lowercase words to be used.

To enable easier understanding, there is a set of recommended names for
commonly used layers:

* `backend` - this layer resides in the browser app and holds the adapter,
that talks to the server.

* `component` - this layer resides in the browser app and is used
to implement specific React components for the UI.

* `browser` - this layer holds the server side code, used to serve
the assets needed for the browser.

* [gateway](./gateway.md) - the part of functionality, relating to the API gateway.
It includes functions relating to API documentation, validations,
route handlers, etc. Usually it includes almost no `business logic`.

* [adapter](./adapter.md) - the part of the functionality, that implements
functions related directly to communicating with external systems, often
handling network protocols. This often relates directly with the
`Data integrity logic`. Examples include handling communication with SQL, HTTP,
FTP, mail and other servers or devices.

* [orchestrator](./orchestrator.md) - the part of the functionality, that
coordinates the work between adapters. This is often the place, where the
`business process` is implemented.

* `test` - this layer holds the test automation functionality, which is
usually only activated during the development and build stages

* `eft` - the part of the `business process` that handles funds transfers.
This is a typical example of online transaction processing (OLTP).
This is usually where high requirements for scalability, transactions per
second (TPS), security and resilience are required, so it deserves a
separate layer.
