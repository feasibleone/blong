# Realm

To achieve a modular approach, the business logic is separated into different realms. This enables
the code to be focused on the realm's functionality and be developed more independently. The word
`realm` is chosen to avoid ambiguity associated with other words like `module`, `domain`, `class`,
while it can still be associated with the particular meaning these words represent in the following
contexts:

- `module` - the modular development approach, but realms are not the same thing as JS/ES module or
  package.
- `domain` - the domain where the focus is, not the domain name from DNS.
- `class` - realm follows the encapsulation and other OOP principles, but is not implementing JS
  classes.

Realms allow development teams to focus their expertise on the details related to the relevant part
of the business process and implement it end to end (i.e. full stack), including test and
documentation.

A realm is scaffolded rather than hand-built: from the CLI with `blong realm <name>`, or through the
API with `kukum.realm.add`. See the [realm pattern](../patterns/realm.md) for the folder layout and
the [kukum pattern](../patterns/kukum.md) for the programmatic entry points.
