# Handler

Handlers are functions that are called by adapters and orchestrators to
implement certain functionality. Handlers can be based on user-defined
APIs or be related to internal logic, for example the
[adapter loop](../concepts/adapter#adapter-loop).

## Internal handlers

The internal handlers have predefined meaning and names and are often related
to some common integration tasks. They have the following purpose:

- `send`: prepare the data for sending, adapting it for the underlying protocol.
  The input data is assumed to be protocol/API independent as much as possible.
- `receive`: transform the received data to be protocol/API independent and remove
  any data not needed by the rest of the system.
- `encode`: JavaScript objects passed to these handlers are converted to Buffer,
  which is then passed to the network.
- `decode`: data frames coming from the network as Buffers are passed to this
  handler and it converts them to JavaScript objects
- `exec`: this handler is called by default if no handler is defined for the [$meta](./meta).method
- `ready`: this handler is called when the adapter is ready to process calls,
  which for some adapters means that connection has been established or
  a TCP port was opened for listening.
- `idleSend`: this handler is called when there has been an idle period
  (longer than the configured) of no outgoing messages. It usually
  sends some kind of echo/keep alive message available in the protocol.
- `idleReceive`: this handler is called when there has been an idle period
  (longer than the configured) of no incoming messages. It usually disconnects
  the adapter, as the expectation is that the other side is sending some
  keep-alive messages.
- `drainSend`: this handler is called when the send queue is emptied or has been
  empty for a pre-configured period. It can be used to trigger processing of
  some pending operations that happen during the idle time of the adapter.

## API based handlers

The API based handlers usually implement some business functionality.
They use namespaces to prefix the names of the API methods. The framework
works best when the naming convention for the methods uses a
[semantic triple](https://en.wikipedia.org/wiki/Semantic_triple)
in the format `subjectObjectPredicate`, where:

- `subject` is the namespace and often is same as the name of the
  [realm](../concepts/realm) if the realm defines only one namespace.
- `object` is often some entity within the realm
- `predicate` is the action being executed on the entity

Here are some examples:

If we have a realm named `user` that has the goal to implement role-based
access control, we can imagine it has the following namespaces:

- `identity`: for implementing the authentication
- `permission`: for implementing the authorization
- `user`: for managing the users and roles. It could
  have methods for objects named `user` and `role`, for example:
  - `userUserAdd` - for creating users
  - `userRoleEdit` - for editing roles

:::note
All handlers are converted to async functions
:::

## Library functions

The library functions implement some reusable functionality that
is repeated across some of the handlers within the same realm.
Any handler, that has a name that does not match the internal handlers
or the API namespaces is considered to be a library function and is not
exposed anywhere else, except to the sibling handlers.

## Folder structure

The handlers and library functions are grouped together and given a name.
This happens by defining them in a subfolder within the realm folder.
This folder is usually in another one, which is used for defining a layer.
The most common approach is to create a separate file for each handler and
use the handler name as file name. This serves multiple reasons:

- allow fast finding of handlers within code editors. For example,
  in VSCode ctrl+p and then typing the first letters of the semantic
  triple will bring the desired handler (i.e. `ctrl+p uua` is likely to find `userUserAdd.ts`)
- easier code review by avoiding files with thousands of rows and a lot of nesting
- better isolation between the handlers

The group name is in the format `realmname.foldername`.
This name is then used in the `imports` property in the adapters and orchestrators.

Let's imagine a realm named `example` which implements a namespace `math` with
several methods for calculating the sum and the average of an array of integer numbers.
To do so, it defines a library function `sum` and handlers `mathNumberSum` and
`mathNumberAverage`. It attaches the handlers to an orchestrator `mathDispatch`.

The following structure is used:

<!-- markdownlint-capture -->
<!-- markdownlint-disable MD033 MD013 MD037 -->
<pre>
📁 example
├──📁 orchestrator
|   ├──📁 math
|   |   ├── error.ts
|   |   ├── sum.ts
|   |   ├── mathNumberSum.ts
|   |   └── mathNumberAverage.ts
|   └── mathDispatch.ts
└── server.ts
</pre>
<!-- markdownlint-restore -->

## Defining handlers and library functions

To enable interoperability between the handlers, library functions,
orchestrators, adapters and the framework, a specific pattern is used
to define them.

To define a library function, use the `library` function from the framework and
pass a function that returns the desired library function with the appropriate name:

```ts
// example/orchestrator/math/sum.ts
import {library} from '@feasibleone/blong';

export default library(api =>
    function sum(...params: number[]) {
        // implementation
    }
);
```

To define a handler, use the `handler` function from the framework and
pass a function that returns the desired handler with the appropriate name:

```ts
// example/orchestrator/math/mathNumberSum.ts
import {handler} from '@feasibleone/blong';

export default handler(api =>
    function mathNumberSum(...params: number[]) {
        // implementation
    }
);
```

## Interoperability

Handlers and functions can call each other by referring through
the `api` parameter. It also allows to access other functions of
the framework.

The `api` parameter has the properties, which are often
used through destructuring. Check the following example,
that explain their usage:

- `example/orchestrator/math/error.ts` - defines the errors.

  ```ts
  import {library} from '@feasibleone/blong';

  export default library(({
    lib: {
          error          // framework function for defining typed errors
    }
  }) => {
      error({
          numberInteger: 'Numbers must be integer'
      })
  });
  ```

- `example/orchestrator/math/sum.ts` - defines the reusable library function `sum`.

  ```ts
  import { library } from '@feasibleone/blong';

  export default library(({
      errors             // access the defined errors
  }) =>
      function sum(params: number[]) {
          if (!params.every(Number.isInteger)) throw errors.numberInteger();
          return params.reduce((prev, cur) => prev + cur, 0);
      }
  );
  ```

- `example/orchestrator/math/mathNumberSum.ts` - defines the handler for
  calculating the sum.

  ```ts
  import {handler} from '@feasibleone/blong';

  export default handler(({
      lib: {
          sum            // user defined library function
      }
  }) =>
      function mathNumberSum(params) {
          return sum(params);
      }
  );
  ```

- `example/orchestrator/math/mathNumberAverage.ts` - defines the handler for
  calculating the average.

  ```ts
  import {handler} from '@feasibleone/blong';

  export default handler(({
      config: {
          precision      // access configuration
      },
      handler: {
          mathNumberSum  // local or remote handler
      }
  }) => async function mathNumberAverage(numbers: number[], $meta){
      if (!numbers?.length) return;
      return ((await mathNumberSum(numbers, $meta)) / numbers.length).toPrecision(precision)
  })
  ```

- `example/orchestrator/mathDispatch.ts` - defines a
  [dispatch orchestrator](./orchestrator#dispatch).

  ```ts
  import {orchestrator} from '@feasibleone/blong';

  export default orchestrator(() => ({
      extends: 'orchestrator.dispatch',
  }));
  ```

- `example/server.ts` - defines the `example` [realm](./realm) and
  the default configuration for the orchestrator.

  ```ts
  import {realm} from '@feasibleone/blong';

  export default realm(() => ({
      config: {
          default: {
              mathDispatch: {
                  namespace: 'number',
                  imports: 'example.number',
              },
          },
      },
      children: ['./orchestrator'],
      ...rest
  }));
  ```
