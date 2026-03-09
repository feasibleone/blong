# Suite

Suites are the top-level organizational unit in the framework. They are used to
group related realms together. Suites are providing a complete solution for a
particular business process, which is usually a vertical slice of the business.

Suites define top-level entry points for the solution and the framework uses
them to run the solution.

Suites often include combination of reusable realms, but also some realms that
are specific to a particular business. They are often created for a particular
deployment of the solution for a certain business entity. They take
architectural decisions on how the solution is going to be deployed and
specific configuration for that deployment. They are the place where the solution
is glued together by reusing the functionality of the different realms.

## Platform

The suites can define entry points for the different platforms, for example:

- `server` - the entry point for the server side solution, which is usually
  running in a Kubernetes pod.
- `desktop` - the entry point for a desktop application.
- `browser` - the entry point for a browser-based application.

## Testing

To facilitate the testing, realms include a minimal suite,
which helps bootstrapping a minimal solution. This suite includes only the
tested realm and its dependencies. This allows testing the realm in isolation,
without the need to run the whole solution, which is often more complex and
slower to start.

For more information see the [suite](../patterns/suite.md) patterns.
