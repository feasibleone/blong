# Templates

`@feasibleone/blong-template` renders JavaScript template literals — `${expression}` inside a string
— in one of two modes: one for templates you wrote, and one for a template you did not.

```ts
import {render, safeRender} from '@feasibleone/blong-template';

render('Hello ${name}!', {name: 'World'}); //   trusted: runs in this process
safeRender('Hello ${name}!', {name: 'World'}); // safe: runs in a bare V8 context
```

Both modes escape the literals around the expressions; only the expressions differ.

## The two modes

| Mode    | Functions                                    | Engine                                  | Use it for                                       |
| ------- | -------------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| Trusted | `render`, `compile`, `renderAll`             | `vm.compileFunction`, cached per string | templates in configuration, adapters and widgets |
| Safe    | `safeRender`, `safeCompile`, `safeRenderAll` | `vm.runInContext` in a fresh context    | a template written or edited by an end user      |

`renderAll` and `safeRenderAll` walk a value — an object, an array, a nested structure — and render
every string in it, which is how a configuration block becomes a resolved one. `compile` and
`safeCompile` return a function, and the trusted `compile` caches it per template string, so a hot
path pays the compilation once.

**The trusted mode can execute arbitrary Node code**, because that is what it is: a function
compiled with the variables in scope. It is the right choice exactly when the template comes from
the repository — configuration files, an adapter's activation block, a model's metadata — and the
wrong choice for anything a user can edit.

## The sandbox

The safe mode evaluates the template in a context created by `vm.createContext`, seeded with the
variables and nothing else. What that removes, verified by running it:

```text
${process}  → ReferenceError: process is not defined
${require}  → ReferenceError: require is not defined
${Buffer}   → ReferenceError: Buffer is not defined
${global}   → ReferenceError: global is not defined
```

The usual escapes do not work either: `[].constructor.constructor('return process')()` throws the
same `ReferenceError`, `Function('return typeof process')()` answers `"undefined"`, and
`globalThis.process` is undefined — because `Function` compiles into the sandbox's own realm rather
than the host's, and the context global is created with a null prototype.

Two properties of the sandbox are worth stating plainly, because they are what it does _not_
promise.

**The context is fresh per call**, so a template cannot leave state for the next one — a global it
sets is gone in the following render. **The variables are not copied**, though: a template that
mutates a nested object mutates the caller's object, so the data handed in should be treated as
read-only.

What remains available is the realm's built-ins — `Array`, `Object`, `Math`, `JSON`, `Date`,
`RegExp`, `Map`, `Set`, `Intl` and the rest, including `Function` and `eval` — which is enough to
compute with and not enough to reach the host. The `blong` helper namespace is added, frozen, with
`escapeXml`, `escapeHtml`, `escapeJson`, `join` and the `xml` / `html` / `json` tagged templates.

## The time bound

A template that never finishes is a denial-of-service waiting to happen, so the safe mode runs under
a one-second budget:

```text
Error: Script execution timed out after 1000ms
```

The bound is enforced by V8, and a template cannot catch it from the inside — a `try`/`catch` around
an infinite loop still times out. It covers _synchronous_ work, which is what a template can do: an
`async` function's body runs synchronously until its first `await`, so a loop before that `await` is
bounded too. There is no memory cap, and a caller is always free to render many times, so the bound
is a CPU guard rather than a complete resource policy.

## A third implementation, in the browser

The browser build has no `vm`, so the same API is implemented differently on that platform: the
trusted mode uses `new Function`, and the safe mode is an evaluator over the parsed syntax tree with
a restricted grammar. A browser-side safe template cannot express a loop or a function expression at
all — it throws `Template references an undefined variable` rather than timing out, because there is
no syntax for the thing that would run away. The guarantee is weaker than in Node in one direction
(the grammar is the limit) and stronger in another (there is nothing to time out).

## Where each mode is used

Every caller in this repository uses the **trusted** mode, which is the point of the two-mode split:
the mode has to match where the template came from.

- `blong-config` renders the merged configuration, which is why `--config`, rc files and the
  master-key decrypt work at all — the decrypt is reachable precisely because the template is
  trusted.
- The registry renders an adapter's or a realm's configuration before it is used (`AdapterBase`,
  `Registry.render`), and `renderAll` is what walks it.
- The portal's component widget renders a page's definition and parameters with the form's values as
  variables.
- A model can put an expression in its metadata (party models use `${current}`, for example), which
  the same registry render resolves.

The **safe** mode has, at the time of writing, no caller outside its own tests. It is a capability
with an intended use — a template that arrives from a user, a partner or a database row rather than
from the repository — and the honest statement of its status is that the boundary exists and is
tested, and that nothing crosses it yet.

## Testing a template

The two properties worth asserting are the ones that fail silently otherwise: that the sandbox
refuses a host global, and that the time bound fires.

```ts
import {render, safeRender} from '@feasibleone/blong-template';

// trusted: reaches the host, which is why it is trusted
render('${process.pid}', {});

// safe: refuses it, and says so
safeRender('${process}', {}); // throws ReferenceError: process is not defined

// safe: bounded
safeRender('${(() => { while (true) {} })()}', {}); // throws Script execution timed out
```

## See also

- [Configuration pattern](./configuration.md) — the merge chain whose last step is the renderer
- [i18n pattern](./i18n.md) — the other text-substitution mechanism, which is not this one
- `core/blong-template/README.md` — the package's own reference
