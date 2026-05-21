# @feasibleone/blong-template

TypeScript template engine for the Blong framework.

Templates use JavaScript template-literal syntax (`${expression}`). A `blong`
helper namespace is available inside every expression for escaping and
formatting output.

## Two execution modes

| Mode        | API                                          | Use when                                                                 |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| **Trusted** | `render`, `compile`, `renderAll`             | Templates authored by developers (config files, bundled email templates) |
| **Safe**    | `safeRender`, `safeCompile`, `safeRenderAll` | Templates that may be written or edited by end-users                     |

The **trusted** mode uses `vm.compileFunction` and caches compiled functions
by template string — it is fast but assumes the template source is trusted.

The **safe** mode runs each template in a fresh V8 context via
`vm.runInNewContext`. The sandbox has no access to `process`, `require`,
`Buffer`, or any other Node.js built-in. Execution is also time-bounded to
prevent infinite-loop denial of service.

---

## Quick start

```typescript
import { render, renderAll, safeRender } from '@feasibleone/blong-template';

// Single string — trusted
render('Hello ${name}!', { name: 'World' });
// => 'Hello World!'

// Recursive object — trusted
renderAll(
  { greeting: 'Hello ${name}!', score: 100 },
  { name: 'Alice' }
);
// => { greeting: 'Hello Alice!', score: 100 }

// User-supplied template — sandboxed
safeRender('Dear ${title} ${surname},', { title: 'Dr', surname: 'Smith' });
// => 'Dear Dr Smith,'
```

---

## API reference

### `render(template, vars?)`

Render a template string immediately.

```typescript
render('${a} + ${b} = ${a + b}', { a: 1, b: 2 });
// => '1 + 2 = 3'
```

### `compile(template)`

Compile a template once and return a reusable render function. The compiled
function is cached internally, so calling `compile` with the same string
multiple times is cheap.

```typescript
const greet = compile('Hello ${name}!');
greet({ name: 'Alice' }); // => 'Hello Alice!'
greet({ name: 'Bob' });   // => 'Hello Bob!'
```

### `renderAll(value, vars?)`

Recursively walk a nested object/array and render every string value.
Non-string leaves are returned as-is.

```typescript
renderAll(
  {
    subject: 'Order ${orderId} shipped',
    body: { intro: 'Hi ${name},' },
    retries: 3,
  },
  { orderId: 'ORD-42', name: 'Alice' }
);
// => { subject: 'Order ORD-42 shipped', body: { intro: 'Hi Alice,' }, retries: 3 }
```

### `safeRender(template, vars?)`

Sandboxed version of `render`. Runs in an isolated V8 context with:

- No access to `process`, `require`, `Buffer`, or host globals.
- Null-prototype sandbox to block prototype-chain escapes.
- 1-second execution timeout.

```typescript
safeRender('Welcome, ${blong.escapeHtml(name)}!', { name: '<script>alert(1)</script>' });
// => 'Welcome, &lt;script&gt;alert(1)&lt;/script&gt;!'
```

### `safeCompile(template)`

Sandboxed version of `compile`. The template is escaped once; a fresh
context is created per invocation to maintain variable isolation between
calls.

### `safeRenderAll(value, vars?)`

Sandboxed version of `renderAll`.

---

## The `blong` helper namespace

Every template expression has access to the `blong` object with the following
members:

### Escape functions

```typescript
blong.escapeXml(value)   // & " ' < >  →  &amp; &quot; &apos; &lt; &gt;
blong.escapeHtml(value)  // & " ' < >  →  &amp; &quot; &#39;  &lt; &gt;
blong.escapeJson(value)  // serialize for embedding inside a JSON string
```

### Tagged templates (escape on interpolation only)

```typescript
blong.xml`<item id="${id}">${content}</item>`
// Static parts are output verbatim; only ${...} values are XML-escaped.

blong.html`<p class="${cls}">${userText}</p>`
// Same for HTML.

blong.json`{"name":"${name}","note":"${note}"}`
// Each ${...} value is serialized as a JSON string fragment.
```

### Array joining

```typescript
blong.join(items, ', ')
// => 'a, b, c'
```

### Usage examples

```yaml
# config.yaml — trusted template inside a developer config file
database:
  url: postgresql://${db.host}:${db.port}/${db.name}
  pool: ${db.poolSize}

email:
  subject: "Order ${orderId} confirmed"
  body: |
    Hi ${blong.escapeHtml(customerName)},
    Your order has been confirmed.
```

```typescript
import { renderAll } from '@feasibleone/blong-template';

const config = yaml.parse(fs.readFileSync('config.yaml', 'utf8'));
const resolved = renderAll(config, {
  db: { host: 'localhost', port: 5432, name: 'db-name', poolSize: 10 },
  orderId: 'ORD-99',
  customerName: 'Alice <Tester>',
});
```

---

## Escaping literals in templates

Because templates use JavaScript template-literal syntax, a few characters
need special treatment when you want them to appear literally in the output:

| You want in output | Write in template |
| ------------------ | ----------------- |
| A backtick `` ` `` | `` \` ``          |
| A literal `${`     | `${'$'}{`         |

Backslashes are automatically handled — the engine escapes them before
compilation so `C:\users\bob` in a config value is passed through unchanged.

---

## Security notes

### Trusted mode

Use trusted mode **only** for templates whose source you control. Malicious
template content can execute arbitrary Node.js code including reading files,
making network requests, and spawning child processes.

### Safe mode

The safe sandbox (`safeRender` / `safeCompile` / `safeRenderAll`) provides:

1. **No host globals** — `process`, `require`, `Buffer`, `__dirname`, etc. are
   not available.
2. **Prototype isolation** — the sandbox context is seeded from
   `Object.create(null)`, breaking the classic prototype-chain escape.
3. **Timeout** — execution is capped at 1 second to prevent DoS via infinite
   loops.
4. **Standard JS built-ins are still available** (`Array`, `Object`, `Math`,
   etc.) because they come from the new V8 context, not the host.

> **Note:** Safe mode is designed for *config-level* template expressions.
> For a full application-level sandbox (e.g., running untrusted plugins),
> consider a dedicated sandboxing solution such as a Worker thread or a
> separate process.

---

## Comparison with `ut-function.template`

| Feature | `ut-function.template` | `blong-template` |
| ------- | ---------------------- | ---------------- |
| Language | JavaScript | TypeScript |
| Helper namespace | `ut` | `blong` |
| Sandboxed mode | Via acorn AST evaluator | `vm.runInNewContext` |
| Template caching | Partial (by template + keys) | Full (by template string) |
| Backtick in template | Bug — causes syntax error | Correctly escaped |
| Backslash in template | Bug — misinterpreted as escape | Correctly escaped |
| Recursive object render | ✓ | ✓ |
| TypeScript types | Stub only | Full types |
| DoS timeout | ✗ | ✓ (safe mode) |
