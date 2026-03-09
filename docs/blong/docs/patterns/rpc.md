# RPC

The RPC mechanism is based on [JSON-RPC 2.0 specification](https://www.jsonrpc.org/specification), which defines a
simple protocol for remote procedure calls.
Two variants of the RPC mechanism are implemented in the framework:

## External API

This API is exposed to the external world, for example to the front end applications or to third party systems.
Usually it is automatically generated based on the defined handlers, but some aspects of it can be customized.
It uses the following conventions:

Request:

```http
POST https://example.com/rpc/<subject>/<object>/<predicate>
Content-Type: application/json
Authorization: Bearer <token>

{
    "jsonrpc": "2.0",
    "method": "subjectObjectPredicate",
    "params": <params>,
    "id": 1
}
```

Response for successful calls:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
    "jsonrpc": "2.0",
    "result": <result>,
    "id": 1
}
```

Response for failed calls:

```http
HTTP/1.1 <errorStatusCode> <errorStatusMessage>
Content-Type: application/json

{
    "jsonrpc": "2.0",
    "error": {
        "type": <errorType>,
        "message": <errorMessage>,
        "print": <errorPrint>,
        "validation": <errorValidation>,
        "params": <errorParams>,
        "cause": <errorCause>,
        "stack": <errorStack>,
    },
    "id": 1
}
```

Notifications do not have an `id` field, as they do not expect a response:

```http
POST https://example.com/rpc/<subject>/<object>/<predicate>
Content-Type: application/json
Authorization: Bearer <token>

{
    "jsonrpc": "2.0",
    "method": "subjectObjectPredicate",
    "params": <params>
}
```

Where:

- `subjectObjectPredicate` is the name of the method being called, which is matching the internal API method name
- `params` is the parameters being passed to the method, which is matching the internal API parameters
- `result` is the result of the method being called, which is matching the internal API result
- `errorXXX` are the properties of the error, which are matching the properties of the
  [typed errors](./error.md) defined in the framework
- `errorCause` and `errorStack` are only included in the response when the debug mode is on, to avoid leaking sensitive
  information in production environments

## Internal API

This API is used for the communication between the microservices, when the framework is used in a microservice
architecture. It uses the following convention:

Request:

```http
POST http://microservice-name/ports/<subject>/request
Content-Type: application/json

{
    "jsonrpc": "2.0",
    "method": "subjectObjectPredicate",
    "params": [...<arguments>, <metadata>],
    "id": 1
}
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
    "jsonrpc": "2.0",
    "result": [<result>, <metadata>],
    "id": 1
}
```

Notifications use a separate endpoint and do not have an `id` field, as they do not expect a response:

```http
POST http://microservice-name/ports/<subject>/publish
Content-Type: application/json

{
    "jsonrpc": "2.0",
    "method": "subjectObjectPredicate",
    "params": [...<arguments>, <metadata>]
}
```

Where:

- `<subject>` is matching the namespace of the adapter, which is going to handle the call
- `<arguments>` is an array of arguments being passed to the method
- `<result>` is the result of the method being called
- `<metadata>` is an object containing [metadata](./meta.md) about the call

The internal API never returns errors as JSON-RPC errors, but instead returns the error information in the result,
and sets metadata `mtid` to `error`.
