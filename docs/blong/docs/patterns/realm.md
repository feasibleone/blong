# Realm

To define a [realm](../concepts/realm.md) use the `realm` function from the framework.
The function passed to `realm` must return an object with the following properties:

- `url`: the URL of the realm
- `validation`: validation schema for the realm config
- `children`: paths from which to load the layers or other realms
- `...rest`: the rest of the properties are used for config activations.
  Each activation contains properties for turning on layers
  or configuring adapters, orchestrators or handlers. For example
  the property `test` usually activates all layers, that are needed
  during the automated tests, for example:

  ```ts
  {
      test: {
          adapter: true,
          orchestrator: true,
          gateway: true,
          test: true
      }
  }
  ```

  Or the `default` activation can configure adapter properties:

  ```ts
  {
      default: {
          backend: {
              logLevel: 'fatal'
          }
      }
  }
  ```

Realm example:

```ts
// realmname/server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    validation: blong.type.Object({}),
    children: ['./adapter'],
    // config activations
    default: {},
    test: {
        adapter: true
    },
    realm: {
        adapter: true
    },
}));
```
