# Validation

Validation definitions are used for:

- preparing the API documentation
- validation of parameters
- constructing responses

Validations can be automatically derived from types defined
for the handler parameters and result, or can be manually specified.

## Automatic

For automatic definitions the following is required:

- Put a file named `~.schema.ts` in the folder where the handlers are defined.
    This file is automatically updated when its date is older than another
  file within the folder, where a type named `Handler` is defined.
- Define the type `Handler` for each handler that will use automatic
  validations. Here is an example how it must be defined:

  ```ts

  import {IMeta, handler} from '@feasibleone/blong';

  /** @description "Description of the handler" */
  type Handler = ({
      /** @description "Description of param property" */
      paramProperty: string
  ) => Promise<{
      /** @description "Description of result property" */
      resultProperty: number;
  }>;

  export default handler(() =>
    async function subjectObjectPredicate(
        params: Parameters<Handler>[0],
        $meta: IMeta
    ): ReturnType<Handler> {
        // implementation
    }
  );
  ```

## Manual

To define validations manually, put them in a subfolder
of the `gateway` layer and use the `validation` function from the
framework. The framework will provide access to the
[TypeBox](https://github.com/sinclairzx81/typebox) API
via the `lib.type` property.

Here is an example:

```ts
// realmname/gateway/subject/subjectObjectPredicate.ts
import {validation} from '@feasibleone/blong';

export default validation(({lib: {type}}) =>
    function subjectObjectPredicate() {
        return {
            // at a minimum, define the types of params and result
            params: type.Any(),
            result: type.Any(),
            // some optional overrides
            auth: false,                // turn off authentication
            description: 'description', // set the description for docs
            method: 'GET',              // the default is POST
            path: '/some/path',         // change the path
        };
    }
);
```
