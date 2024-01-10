# REST

## Server

To implement REST APIs:

- pass the API definition in the configuration
- implement the handlers

## Client

To call REST APIs, use the [HTTP adapter](./adapter#http) and the [OpenAPI codec](./codec#openapi),
for example:

```ts
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    default: {
        http: {
            imports: ['codec.openapi'],
            namespace: ['time'],
            'codec.openapi': {
                namespace: {
                    time: [
                        'world-time.json',
                        'world-time.operations.json'
                    ]
                }
            }
        }
    },
    children: ['./adapter']
}));
```

```ts
// realmname/adapter/http.ts
import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.http'
}));
```
