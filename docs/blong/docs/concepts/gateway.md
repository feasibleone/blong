# Gateway

Gateway is also known as "API Gateway" is the public facing interface of the
server. It exposes the functionality as a set of JSON-RPC endpoints by default,
but also REST endpoints can be exposed.

The gateway is defined as a layer and plays role when:

- serving the API
- serving the API documentation
- exposing the above through a Kubernetes ingress

For more information read about the [validation pattern](../patterns/validation.md).
