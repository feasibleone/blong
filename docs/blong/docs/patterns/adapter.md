# Adapter

Blong includes the following commonly used adapters:

## TCP

Used for stream-based adapters.

To use them follow this pattern:

```ts
// realmname/adapter/adaptername.ts
import { adapter } from '@feasibleone/blong';

export default adapter<object>(api => ({
    extends: 'adapter.tcp'
}));
```

TCP adapter configuration properties:

```yaml
host: hsm.example.com                # host to connect to
port: 1500                           # port to connect to
listen: false                        # set to true to listen for connections
localPort:                           # port to listen for connections
socketTimeOut:                       # inactivity disconnect timeout
maxConnections:                      # maximum number of connections to accept
connectionDropPolicy:                # which connections to drop
format:
  size: 16/integer                   # the format of the size header
imports: ctp.payshield               # codec name
ctp.payshield:
  headerFormat: 6/string-left-zero   # codec params
idleSend: 10000                      # echo interval in milliseconds
maxReceiveBuffer: 4096               # maximum size in bytes of a single message
tls:                                 # TLS config
  ca: /some/path/ca.crt
  cert: /some/path/tls.crt
  key: /some/path/tls.key
```

## HTTP

Used for HTTP-based adapters.

```ts
// realmname/adapter/adaptername.ts
import { adapter } from '@feasibleone/blong';

export default adapter<object>(api => ({
    extends: 'adapter.http'
}));
```

HTTP adapter configuration properties:

```yaml
url: http://example.com              # Base URL for all requests
tls:                                 # TLS config
  ca: /some/path/ca.crt
  cert: /some/path/tls.crt
  key: /some/path/tls.key
```

:::note
When using OpenAPI/Swagger definitions, make sure to include
`'codec.openapi'` in the `imports` property.
:::

## Configuration

All adapters share some common configuration properties, such as:

- `logLevel` - the log level for the adapter
- `namespace` - prefixes used to call the adapter API
- `imports` - handlers to attach in the adapter

See the [configuration pattern](./configuration.md) for more details
about the places where adapters can be configured.
