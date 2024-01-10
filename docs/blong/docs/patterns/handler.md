# Handler

Handlers are functions being called by the adapters and orchestrators to
implement certain functionality. Handlers can be based on user defined
API or be related to internal logic, for example the
[adapter loop](../concepts/adapter#adapter-loop)

## Internal handlers

The internal handlers have predefined meaning and names and are often related
to some common integration tasks. They have the following purpose:

- `send`: prepare the data for sending, adapting it for the underlying protocol.
  The input data is assumed to be protocol/API independent as much as possible.
- `receive`: transform the received data to be protocol/API independent and remove
  any data not needed by the rest of the system.
- `encode`: JavaScript objects passed to this handlers are converted to Buffer,
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
  the adapter as the expectations is that the other side is sending some
  keep alive messages.
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

If we have a realm named `user` that has the goal to implement role based
access control, we can imagine it has the following namespaces:

- `identity`: for implementing the authentication
- `permission`: for implementing the authorization
- `user`: for managing the users and roles. It could
  have methods for objects named `user` and `role`, for example:
  - `userUserAdd` - for creating users
  - `userRoleEdit` - for editing roles

## Library functions

The library functions implement some reusable functionality, that
is repeated across some of the handlers within the same realm.
Any handler, that has a name that does not match the internal handlers
or the API namespaces is considered to be a library function and is not
exposed anywhere else, except to the sibling handlers.

## Folder structure

The handlers and library functions are grouped together and given a name.
This happens by defining them in a sub-folder within the realm folder.
The most common approach is to create a separate file for each handler and
use the handler name as file name. This serves multiple reasons:

- allow fast finding of handlers within code editors. For example
  in VSCode ctrl+p and then typing the first letters of the semantic
  triple will bring the desired handler (i.e. ctrl+p uua is likely to find userUserAdd)
- easier code review by avoiding files with thousands of rows and a lot of nesting
- better isolation between the handlers

The group name is in the format `realmname.foldername`.
This name is then used in the `imports` property in the adapters and orchestrators.
