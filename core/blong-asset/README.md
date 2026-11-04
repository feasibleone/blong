# @feasibleone/blong-asset

The process a deployed Blong suite's browser bundle is published by: `/s/`, the redirect that sends
`/` there, and nothing else. It loads no realm, needs no database and reads no registry, so the
address a browser fetches a page from is served by a process that carries none of the API's
dependencies or rights.

`realm/blong-kustomize` deploys it as its own Deployment beside the suite's processes, and points
the portal's `/s/` and root paths at it. A suite no longer has to name the realm that serves its
static files — the static files are not a realm's work.

## Usage

```bash
blong-asset --root /opt/deploy/suite/suite/blong-suite/dist \
    --config /etc/blong-asset/config.json
```

| Flag                 | Meaning                                                         |
| -------------------- | --------------------------------------------------------------- |
| `--root <dir>`       | the build output to serve (`BLONG_ASSET_ROOT`)                  |
| `--base <prefix>`    | the prefix it answers under, default `/s/`                      |
| `--host <host>`      | bind address, default `0.0.0.0`                                 |
| `--port <port>`      | port, default `8080` (or `PORT`)                                |
| `--config <file>`    | JSON headers and cache policy (`BLONG_ASSET_CONFIG`)            |
| `--log-level <lvl>`  | pino level, default `warn` (`LOG_LEVEL`)                        |
| `--no-root-redirect` | do not answer `/` with a redirect to the base                   |
| `--no-spa-fallback`  | an unmatched path under the base is a 404 rather than the shell |
| `--no-built-ins`     | do not serve the package's own `favicon.ico` and `robots.txt`   |

The server also answers `/healthz` (the process is alive) and `/readyz` (the bundle directory
exists), which is what a generated Deployment probes.

## Configuration

```json
{
    "base": "/s/",
    "headers": {
        "csp": {
            "scriptHashes": ["'sha256-…'"],
            "styleHashes": [],
            "directives": {"connect-src": ["'self'", "https://api.example.test"]},
            "reportUri": "https://report.example.test/csp"
        },
        "headers": {"x-frame-options": "SAMEORIGIN"},
        "corsOrigins": ["https://app.example.test"],
        "hsts": {"maxAge": 31536000, "includeSubDomains": true}
    },
    "cache": {"html": "no-cache", "immutable": "public, max-age=31536000, immutable"}
}
```

The defaults are the strict end of sensible:

- `Content-Security-Policy` with `default-src 'self'`, `script-src 'self' 'unsafe-eval'` (plus the
  hashes of any inline block the shell actually carries, computed from the document),
  `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` and `form-action 'self'`.
  `'unsafe-eval'` is there because `core/blong-template` compiles its templates with `new Function`;
  a bundle that renders none drops it through `directives`. `style-src` keeps `'unsafe-inline'`
  because component libraries write style attributes. Scripts get no blanket `'unsafe-inline'`.
- Every answer carries what is about the **resource itself**: `X-Content-Type-Options: nosniff`,
  `Cross-Origin-Resource-Policy: same-origin`, the CORS decision, and HSTS over TLS (a host policy,
  read from any secure response). The **document** policies — the CSP above,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
  with the ambient sensors off, `Cross-Origin-Opener-Policy: same-origin`,
  `X-DNS-Prefetch-Control: off` and `X-Permitted-Cross-Domain-Policies: none` — ride only on the
  HTML shell, because a browser reads a script for what it is and who may embed it, not for the
  policies of the page it belongs to. A 404 is not a page either, so it gets the resource set alone.
- HSTS only over TLS, because a header that promises a protocol on a plain-HTTP port-forward is a
  header that breaks the page it was meant to protect.
- No CORS by default. `corsOrigins` names the origins a reader may fetch the bundle from; `*` is a
  deliberate choice rather than a default.
- CSRF is not a static server's to add: there is no state, no cookie and no form here. The policy
  carries `form-action` and `base-uri`, and the API's own protection stays with the API.

## Cache

A build's output is two kinds of file under one directory. The shell names the hashed files, so it
is revalidated on every visit (`no-cache`); a file whose name carries its content hash is cached for
a year (`immutable`), because a new build gives it a new name; everything else is cached for an
hour.

## Delivery

- A precompressed sibling (`.br`, `.gz`) is preferred whenever the client accepts it.
- A navigation (`Accept: text/html`) for a path with no extension answers with `index.html`, which
  is what a single-page app's client-side routes need. A missing file with an extension stays a 404.
- A path that would leave the bundle — a `..` segment, an encoded one, a backslash, a malformed
  escape — is refused before it is normalised, and the filesystem join is checked a second time.
- The bundle directory may be absent at startup (a volume is filled by a Job), so the process comes
  up and reports not-ready rather than refusing to start.

## In the image

The package is a dependency of `@feasibleone/blong-gogo`, so a `rush deploy` of the framework
carries it at `common/deploy/core/blong-asset/`. The image also links it as `blong-asset`, and a
generated Deployment runs the file directly with `node` because the image's entry point is the
framework's own.
