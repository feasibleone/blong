# Adapter

Adapters are components within the framework, which take care of integration
with external systems. Their goal is to expose these systems as a high level
API, which is compatible with the framework's naming conventions and also
is independent of the API or protocol used by the external system.

See the [adapter design pattern](https://en.wikipedia.org/wiki/Adapter_pattern).

There are two types of adapters supported:

## Stream based

Stream based adapters usually communicate with the external system by implementing
a protocol, that operates directly on top TCP. They serialize and deserialize
stream of bytes. This happens in two handlers:

- `encode`: JavaScript objects passed to this handlers are converted to Buffer,
  which is then passed to the network.
- `decode`: data frames coming from the network are passed to this handler and
  it converts them to JavaScript objects.

This set of handlers is also known as `codec`. Codecs usually also take care of
matching responses to their corresponding requests, as these protocols often allow
[multiplexing](https://en.wikipedia.org/wiki/Multiplexing)

## API based

API based adapters operate with higher level protocols like HTTP or even
SDKs that are available for the external system. In this case the codec is not needed,
as the API or SDK allows JavaScript objects to be used directly.
HTTP is somewhere between the API based and stream based, as the transport
part of the communication is solved by the protocol (i.e. request/response
matching and boundaries). There is still some need of serialization and deserialization
of the request or response body,

## Adapter loop

The adapters perform a sequence of steps, where they call handlers with specific
names as per the following diagram:

![adapter-loop](img/adapter-loop-dark.png#gh-dark-mode-only)![adapter-loop](img/adapter-loop-light.png#gh-light-mode-only)

When a handler with the corresponding name exists in the adapter, it can
transform the data being processed. Multiple handlers with the same name can be stacked
on top of each other, so that they address different aspects of the communication,
for example message level encryption and decryption can be implemented on top
of the existing protocol.
