# Codec

Use the codecs to implement protocols on top of lower level ones.

## Configuration

Codecs are configured by including their configuration in the
adapter's configuration, while using their identifier (`codec.xxx`)
as a key name. For example:

```js
export default realm(() => ({
    dev: {
        http: {
            'codec.openapi': {
                namespace: {}
            }
        }
    }
}
```

## HTTP codecs

The HTTP codecs can be imported in the HTTP adapter, to implement
specific functionality. They are implemented as a pair of `send` and
`receive` handlers.

The framework includes the following commonly used HTTP codecs:

### OpenAPI

Import `codec.openapi`, to enable easy calling of external API, when it has
OpenAPI or Swagger definition available. This usually happens at the server,
when integrating with third party systems. The adapter can be called using an
`operationId` from the API definition, prefixed with the namespace. Then this
codec will determine the required HTTP method, path, headers and body for the
request, based on the API definition. If `operationId` is not defined in the
API, then it can be configured by merging and additional definition, that
specifies `operationId` for each HTTP method and path.

This codec has the following configuration:

```yaml
namespace:                           # API definitions per namespace
  time:                              # Namespace for the definitions
    - some/path/world-time.yaml      # OpenAPI/Swagger definition files
    - some/path/world-time.operations.yaml
  k8s:                               # Namespace for the definitions
    - http://k8s.com/k8s-apps.json   # OpenAPI/Swagger definition URLs
    - http://k8s.com/k8s-discovery.json
    - http://k8s.com/k8s-version.json
```

### JSON-RPC

The `codec.jsonrpc` can be imported in the HTTP adapter, to enable easy calling
of the framework's JSON-RPC based APIs. This is usually done in the front end,
but can be also used for other cases, like server to server calls.
This codec will automatically determine the path for the called method,
pass the parameters in the request body and process the response by returning
the result or the error of the call.

### Message Level Encryption

The `codec.mle` can be imported in the HTTP adapter, to enable message level encryption
when communicating with the framework's server. This codec must be put after `codec.jsonrpc`
in the `imports` array.

## TCP codecs

The TCP codecs can be imported in the TCP adapter, to implement
specific protocols. They are implemented as a pair of `encode` and
`decode` handlers.

The framework includes the following commonly used TCP codecs:

## Payshield

## SMPP

## APTRA/NDC

## ISO8583
