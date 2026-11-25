# Adapter

Adapters are components within the framework that take care of integration with external systems.
Their goal is to expose these systems as a high-level API that is compatible with the framework's
naming conventions and also independent of the API or protocol used by the external system.

See the [adapter design pattern](https://en.wikipedia.org/wiki/Adapter_pattern).

There are two types of adapters supported:

## Stream based

Stream based adapters usually communicate with the external system by implementing a protocol that
operates directly on top of TCP. They serialize and deserialize a stream of bytes. This happens in
two handlers:

- `encode`: JavaScript objects passed to these handlers are converted to Buffer, which is then
  passed to the network.
- `decode`: data frames coming from the network are passed to this handler and it converts them to
  JavaScript objects.

This set of handlers is also known as a `codec`. Codecs usually also take care of matching responses
to their corresponding requests, as these protocols often allow
[multiplexing](https://en.wikipedia.org/wiki/Multiplexing).

## API based

API based adapters operate with higher level protocols like HTTP or even SDKs that are available for
the external system. In this case the codec is not needed, as the API or SDK allows JavaScript
objects to be used directly. HTTP is somewhere between the API based and stream based, as the
transport part of the communication is solved by the protocol (i.e. request/response matching and
boundaries). There is still some need for serialization and deserialization of the request or
response body.

## Adapter loop

The adapters perform a sequence of steps, where they call handlers with specific names as per the
following diagram:

![adapter-loop](img/adapter-loop-dark.png#gh-dark-mode-only)![adapter-loop](img/adapter-loop-light.png#gh-light-mode-only)

When a handler with the corresponding name exists in the adapter, it can transform the data being
processed. Multiple handlers with the same name can be stacked on top of each other, so that they
address different aspects of the communication, for example message level encryption and decryption
can be implemented on top of the existing protocol.

## What an adapter does not do

An adapter reaches exactly one system: the database, the broker, the vendor's API, the file store.
Two calls are therefore wrong, whichever way the code is written — an import across the layer
boundary, or a handler name in the destructured `handler` proxy:

- **An adapter does not call an orchestrator.** The orchestrator decides what happens next. An
  adapter that calls one has moved that decision into the layer a deployment can swap out, and the
  same realm now behaves differently depending on which adapter happens to be configured.
- **An adapter does not call another adapter.** Chaining two integrations is a sequence, and a
  sequence is a business process. When two systems have to be written in one order — produce to the
  broker, then record the partition on the row — the order belongs to an orchestrator that calls
  both. Another handler in the _same_ group is not another adapter: `db/a` calling `db/b` is one
  component using its own helper, and a helper several handlers need is a library function of the
  group rather than a call between handlers.

What to do instead: raise the step into an orchestrator, which calls the adapters it needs and holds
the order, the retries and the fallbacks. Naming the call is the same rule in miniature: a method
whose subject is the adapter's own namespace needs no prefix — `kafkaMessageSend` is the `kafka`
adapter's — while one the adapter answers under the realm's namespace is qualified with the adapter
that serves it, `db/agentSessionGet` for `agent.session.get`. The prefix names the component; the
triple names the method. An adapter that finds itself needing a second system is usually a sign that
the handler is an orchestrator that was written in the adapter's folder — that was the case for
`agent.telemetry.insert` and `agent.session.watch` in `blong-agent`, which chose between a broker
and an in-memory ring and were moved to `orchestrator/session/` (`@@D-1013`).

The one edge that stays is a **delivered event**, and only where the transport insists on it. A
framework that dispatches on the port it subscribed with — a codec's webhook, a broker's consumer
group — hands the message to the adapter that listens, and the adapter has nothing to decide: it
forwards the message to the one orchestrator method that acts on it and returns what that method
answered. It forwards one call, resolves nothing, reads nothing and writes nothing — anything more
is the first rule again.

Wherever the subscription can be the caller's, it should be. A reader that opens a channel and
decides what a message means is an orchestrator, and the adapter answers a sequence rather than
dispatching: `{ns}.sub.watch` on the redis adapter and `{ns}.topic.watch` on the kafka one both
return an async iterable the caller reads. `blong-agent`'s answer wake is the worked example — the
dispatch orchestrator opens `notify.sub.watch` in its `ready()` and dispatches `agent.answer.wake`
itself, so no adapter method stands between the channel and the decision (`@@T-816`), and the
forwarding handler that used to be there is gone.

Types may cross a boundary — an adapter naming an orchestrator's interface costs no behaviour. What
may not cross is a call.
