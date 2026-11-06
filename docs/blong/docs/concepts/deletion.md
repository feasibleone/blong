# Deletion

A model says how deleting one of its records resolves, and the generated browse page obeys it. There
are four modes: **prompt** (ask first, naming the records that would go with it), **cascade** (take
them without asking), **block** (refuse, and say what still refers to the record) and **deactivate**
(hide the record instead of removing it). Prompt is the default, so a model that says nothing still
never deletes anything a person has not agreed to.

What a delete would take is not declared: the server counts the rows that still point at the record
from the database's own foreign keys, in the same vocabulary the page shows. A cascade follows those
foreign keys too, deleting deepest first, so a chain of records goes in one transaction rather than
failing on the constraint its own children hold.

The mode belongs to the entity, not to the button: a profile asks, a classifier other records point
at is refused, a row that belongs to a parent goes with it. A realm writes no handler for any of it.

See the [pattern guide](../patterns/deletion.md) for the configuration and what each mode does to
the database. See the [model system](blong-model.md) for the pages a model generates.
