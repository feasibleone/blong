# Validation

Validation definitions are used for:

- preparing the API documentation
- validation of parameters
- constructing responses

Validations can be automatically derived from types defined
for the handler parameters and result or can be manually specified.

## Automatic

For automatic definitions the following is required:

- Put a file named `~.schema.ts` in the folder where the handlers are defined.
  This file is automatically updated when it's date is older than another
  file within the folder, where interface `ISchema` is defined.
- Define the interface `ISchema` for each handler that will use automatic
  validations. Here is an example how it must be defined:

  ```ts

  import {IMeta, handler} from '@feasibleone/blong';

  interface ISchema { // this must be on a separate line
      /** @description "description of parameter" */
      params: object;
      /** @description "description of result" */
      result: number;
  } // this must be on a separate line

  export default handler(() =>
    function subjectObjectPredicate(
        params: ISchema['params'],
        $meta: IMeta
    ): ISchema['result'] {
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
            // as minimum, define the types of params and result
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
