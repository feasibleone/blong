# The Story Toolbar

## Problem

A Storybook story is the cheapest place to look at a screen and the most expensive place to trust
one. A model page story built on `meta/fixture` rows renders perfectly while the gateway method
behind it is misspelled, the capability behind that method is missing, and the seeded row it opens
does not exist in any database. Every realm's CI has, at some point, watched a page work in
Storybook and fail in the application.

The previous generation of these tools solved it with a toolbar. `ut-storybook` offered three
globals — backend, theme and direction — where the backend value was the _name of a configuration
file_: choosing `origin` merged the implementation's real-backend overlay instead of the `mock` one,
and a dev-server middleware proxied the RPC paths to wherever a developer's `.ut_portal_devrc`
pointed, complete with a bearer token pasted into the file. It was crude and it worked, and it is
the reason a story could be shown to a reviewer against a deployed environment.

Blong's Storybook is Vite-based and its previews are one decorator over a platform boot, so the same
idea had to be re-expressed rather than copied.

## Solution

Three decisions shaped it.

**The switch belongs in the adapter, not in the network layer.** The mock in Blong is not an HTTP
interceptor; it is a backend-adapter behaviour that replaces the _model_ handler groups with an
in-memory implementation over the fixture rows. Switching a story therefore means choosing a
different adapter activation, and everything above the adapter — the model system, the pages, the
permissions the page hides, the toolbar of the resource — is exactly the code the application runs.
Intercepting `fetch` instead would have been simpler to build and would have tested the transport,
which is the part nobody doubted.

**Authentication belongs in the dev server, not in the story.** A story cannot log in: it has no
credentials and no business holding any. The plugin behind the toolbar holds a session for the
JSON-RPC mode and mints its token from the seeded test users the realm's own test seed already
declares — the same users a Playwright run signs in as. For the MLE mode it does not: there the page
logs in through the platform's own codec, so the key pair the page generated stays the one that
signs and encrypts.

That asymmetry was measured rather than chosen. The first design had the plugin mint one token for
both modes, in the shape the gateway supports for callers whose keys travel per request in the JWE
header. Against a running gateway it turned out that a login response is always encrypted, so such a
token cannot be read back out of it — the plugin could hold it, never hand it over. The MLE mode
therefore logs in from the page, using the role's credentials, which the endpoint hands to the
story's own origin on loopback. The reviewer still never sees a login screen: the login is the
decorator's, and the story waits for it before rendering, because a page that fetched first would
take a 401 and stay empty even once a session existed.

**Presentation goes through the state the application already has.** A platform-loaded story renders
the container the platform built, so there is no prop to pass a theme to; the app store is the only
channel. That choice has a consequence worth naming: a store write is global, so the toolbar's
_defaults_ must not be written at all, or a story that sets its own `lang` arg loses it. Only a
choice the reviewer actually changed is applied.

## What Was Not Built

- An impersonation endpoint. Roles are seeded users, so adding a role is a seed entry and a line in
  the configuration, not a new capability in the authentication realm.
- A long-lived token in the login realm. The dev proxy re-logs in near expiry instead — a story
  needs a session, not a permanent one, and the login realm's absolute session cap stays untouched.
- A configuration format of its own. The plugin reads the `storybook:` section of `.blong_devrc`,
  which the developer's other tooling already uses.
- A middleware file. The proxy is code in `blong-browser`, so it is typed, unit-tested where it can
  be, and available to every realm that uses `defineBlongStorybookMain`.

The toolbar's Backend and Role items are also the reason a realm must grant its roles something: a
Guest with no capability is a 403, and showing that is as useful as showing the happy path. The
grant has to include `subject.object.schema` even for a read-only role — the page loads its own
schema before it loads rows, so a role without it renders a blank screen instead of a smaller one.

## See Also

- [The story toolbar](../patterns/blong-browser.md#the-story-toolbar) — how to use it
- [Storybook](../concepts/browser-ui.md#storybook) — the two setups
- [Kopi](../patterns/kopi.md) — the template every realm starts from
- [Intents](./intents.md) — the activation mechanism the live modes use
