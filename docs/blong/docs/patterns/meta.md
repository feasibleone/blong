# Meta

To implement various kinds of functionality the framework uses a metadata object,
which is passed to the handlers. The convention is to use a variable
named `$meta` to refer to that parameter.

The metadata may contain the following properties:

- `mtid`: the type of message being processed, one of `request`, `response`,
  `notification`, `error`, `event`
- `method`: the method name
- `auth`: authentication information
  - `actorId`: user identifier
  - `sessionId`: session
  - `mlek`: encryption key
  - `mlsk`: signing key
  - `permissionMap`: map of permissions
- `language`:
  - `languageId`: active language
- `httpResponse`: used to set HTTP response properties
  - `type`: string to set as content-type
  - `redirect`: URL to redirect to
  - `code`: status code to set
  - `state`: cookies to set
  - `header`: headers to set
- `httpRequest`: contains HTTP request data, when applicable
  - `url`: request URL
  - `state`: request cookies
  - `headers`: request headers
- `expect`: used during tests to suppress logging of expected error types
- `forward`: contains [b3-propagation](https://github.com/openzipkin/b3-propagation)
  data used for tracing
- `dispatch`: optional function to be called during the `dispatch` step of the
  [adapter loop](../concepts/adapter#adapter-loop), instead of the framework's
  built-in dispatch function
- `timeout`: used for tracking the remaining time until timeout
- `gateway`: gateway to use when calling the method
- `validation`: details for the validation error
- `retry`:
- `stream`:
- `headers`:
- `reply`:
- `request`:

Properties used by codecs:

- `trace`:
- `opcode`:
- `conId`:

These properties are used for the audit log and are set by the [gateway](../concepts/gateway),
based on information from the HTTP server and the OS:

- `hostName`:
- `ipAddress`:
- `machineName`:
- `os`:
- `version`:
- `serviceName`:
- `frontEnd`:
- `localAddress`:
- `localPort`:
- `deviceId`:
- `latitude`:
- `longitude`:

These properties are used internally and should not be modified
by user code:

- `cache`: object, that helps for cache implementation
  - `port`:
  - `optional`:
  - `instead`:
  - `before`:
  - `key`:
  - `ttl`:
  - `after`:
- `timer`:
  - `name`:
  - `newTime`:
- `errorCode`: error code when mtid=error, used for logging
- `errorMessage`: error message when mtid=error, used for logging
