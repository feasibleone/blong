# A realm's filesystem over REST

The framework can serve a folder over HTTP, and a VS Code extension implements a filesystem on top
of it: the editor's explorer opens a running realm's directory tree, files are edited in place, and
a command runs on the server with its output streamed back. The server half is built in; the
extension is `ext/rest-fs/`.

## How to enable it

The component is off by default and needs the gateway, which is what serves it:

```ts
// suite server.ts
export default server(blong => ({
    url: import.meta.url,
    config: {
        default: {
            restFs: {
                enabled: true,
                baseDir: '/srv/realm',
                routePrefix: '/api/fs',
                auth: 'jwt',
                shell: false,
            },
        },
    },
}));
```

| Key           | Default         | Meaning                                                      |
| ------------- | --------------- | ------------------------------------------------------------ |
| `enabled`     | `false`         | the switch: nothing is registered until this is true         |
| `baseDir`     | `process.cwd()` | the directory the routes are rooted at and confined to       |
| `routePrefix` | `/api/fs`       | the route prefix, so the editor's base URL ends in `/api/fs` |
| `maxFileSize` | 50 MB           | the largest file a read or write will carry                  |
| `auth`        | `'jwt'`         | `false` or `'jwt'`; the shell route always requires `'jwt'`  |
| `shell`       | `false`         | whether the shell route exists at all                        |

Two behaviours are worth knowing before turning it on. The component is not registered under the
`cli` intent, so a command-line run never serves files; and `auth: false` removes the check from the
file routes but not from `shell`, which keeps its own.

## The routes

All of them are relative to `baseDir`, and every path is resolved through the confinement check
below.

| Route                     | Method   | Purpose                                          |
| ------------------------- | -------- | ------------------------------------------------ |
| `{prefix}/stat/{path}`    | `GET`    | type, size, created and modified times           |
| `{prefix}/readdir/{path}` | `GET`    | the entries of a directory                       |
| `{prefix}/read/{path}`    | `GET`    | the whole file                                   |
| `{prefix}/write/{path}`   | `POST`   | write the body (`application/octet-stream`)      |
| `{prefix}/mkdir/{path}`   | `POST`   | create a directory                               |
| `{prefix}/delete/{path}`  | `DELETE` | delete a file, or a directory with `?recursive=` |
| `{prefix}/rename`         | `POST`   | `{oldPath, newPath, overwrite}`                  |
| `{prefix}/copy`           | `POST`   | `{source, destination, overwrite}`               |
| `{prefix}/shell`          | `POST`   | run a command, stream the output                 |

A path outside the root answers `403`, a missing one `404`, a write that is not a binary body `415`,
and a broken payload `400`.

## Safety

- **Containment.** A path is rejected unless it stays inside `baseDir`, and the resolved path of the
  nearest existing ancestor is checked first, so a symlinked parent cannot be used to step outside
  the root.
- **The shell is the sharp edge.** It is off unless `shell: true`, it always requires a JWT, and it
  spawns with the server's environment and a shell — so enabling it on a deployed environment is a
  deliberate decision about who may run what.
- **One root, one server.** The component serves one `baseDir`; there is no per-path authorisation,
  quota or multi-tenant isolation.

## Pointing an editor at it

The extension (`ext/rest-fs/`) provides the `restfs` scheme, and the authority in the URI is the
workspace name, so one editor can mount several servers:

```jsonc
// settings.json
{
    "restfs.workspace": {
        "realm": {"baseUrl": "http://localhost:8080/api/fs"},
    },
}
```

`RestFS: Open Workspace` picks a configured name and opens `restfs://<name>/` as the folder;
`RestFS: Add Workspace` creates a new entry and `RestFS: Configure` sets its URL and headers. The
server implements `auth: false` or `'jwt'` — a bearer token in the headers — and not HTTP Basic, so
a configuration that sends Basic credentials will be answered with `401`.

## Running a command

The extension contributes a task type, `restfs-shell`. Define a task of that type in the mounted
folder and it runs on the server, with stdout and stderr streamed into the task terminal:

```jsonc
// .vscode/tasks.json inside the mounted folder
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "run realm tests",
            "type": "restfs-shell",
            "command": "node --run ci-test",
        },
    ],
}
```

The provider does not offer tasks by itself, so a task has to be authored — which is also what keeps
what can be run at arm's length.

## What it is not for

The mounted tree does not follow external changes: `watch()` is not implemented, so a file created
on the server by something else appears only on a refresh. Nor is it an IDE replacement or a general
file-transfer tool — the whole file travels in memory within `maxFileSize`, there is no search, and
the point of the feature is inspecting a running environment and making a one-off fix, not working
in one.

## Related

- [REST patterns](./rest.md) — the OpenAPI/REST side of the gateway
- [CLI patterns](./cli.md) — the `cli` intent, which never serves this component
- `ext/rest-fs/README.md` and `ext/rest-fs/QUICKSTART.md` — the extension's own instructions
- `core/blong-gogo/src/RestFs.ts` — the server component
