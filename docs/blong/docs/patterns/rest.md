# REST

## Server

To implement REST APIs:

- use the `api` function to define namespaces for each API

   ```ts
   // realmname/gateway/api/clock.ts
   import {api} from '@feasibleone/blong';

   export default api(() => ({
       namespace: {
           clock: [
               'core/test/api/world-time.yaml',
               'core/test/api/world-time.operations.yaml'
           ],
       },
   }));
   ```

   This will merge the OpenAPI definitions in the given files into a single
   namespace `clock` and mount them at `/rest/` path of the gateway. Merging
   is only needed if the original definition is not good enough, for example
   it does not include the `operationId` field or it is not using the desired
   naming convention.

- Implement the handlers, by prefixing the operationId with the namespace.
  Only paths with HTTP methods that have an `operationId` can have handlers.

   ```ts
   // realmname/orchestrator/clock/clockGet.ts
   import {handler} from '@feasibleone/blong';

   export default handler(
       () =>
           async function clockGet() {
               // implementation
           }
   );
   ```

## Client

To call REST APIs, use the [HTTP adapter](./adapter#http) and the [OpenAPI codec](./codec#openapi),
for example:

- Configure the HTTP adapter in the realm:

   ```ts
   // realmname/server.ts
   import {realm} from '@feasibleone/blong';

   export default realm(blong => ({
       config: {
           default: {
               http: {
                   imports: ['codec.openapi'],
                   namespace: ['time'],
                   'codec.openapi': {
                       namespace: {
                           time: [
                               'world-time.yaml',
                               'world-time.operations.yaml'
                           ]
                       }
                   }
               }
           },
       },
       children: ['./adapter']
   }));
   ```

- Implement the HTTP adapter:

   ```ts
   // realmname/adapter/http.ts
   import {adapter} from '@feasibleone/blong';

   export default adapter(() => ({
       extends: 'adapter.http'
   }));
   ```

- Call the API using the adapter namespace concatenated with the operationId:

   ```ts
   // realmname/orchestrator/subject/handlerName.ts
   import {IMeta, handler} from '@feasibleone/blong';

   export default handler(
       ({handler: {timeGet}}) =>
           async function handlerName(params, $meta: IMeta) {
               return timeGet(params, $meta);
           }
   );
   ```
