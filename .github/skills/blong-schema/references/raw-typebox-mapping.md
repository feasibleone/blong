# blong-schema — Raw TypeBox → SQL mapping

Reference-only: how the convenience types map to SQL internally. **Do not use these raw forms
directly** — always use the convenience functions (`type.increment()`, `type.stringNotNull()`, …).

| Underlying TypeBox type              | SQL column type                                                    |
| ------------------------------------ | ------------------------------------------------------------------ |
| `Type.Integer()` (via `increment`)   | `INT` / `AUTO_INCREMENT` (if name ends `Id`)                       |
| `Type.String({maxLength: N≤255})`    | `VARCHAR(N)`                                                       |
| `Type.String({maxLength: N>255})`    | `TEXT`                                                             |
| `Type.String()` (no maxLength)       | `VARCHAR(255)` (default when no maxLength is given)                |
| `Type.String({format: 'date-time'})` | `DATETIME`                                                         |
| `Type.String({format: 'date'})`      | `DATE`                                                             |
| `Type.String({format: 'uuid'})`      | `UUID` (only for explicit `format: 'uuid'`, NOT for `type.uuid()`) |
| `Type.Boolean()`                     | `BOOLEAN`                                                          |
| `Type.Number()`                      | `DOUBLE`                                                           |
| `Type.Unknown()` / `Type.Object()`   | `JSON`                                                             |
