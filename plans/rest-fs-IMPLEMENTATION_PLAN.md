# REST-FS Server: Built-in Component Implementation Plan

## Overview

### Problem
The blong framework needs a built-in REST filesystem server component that exposes file system operations over HTTP REST endpoints. This enables the `rest-fs` VS Code extension (in `ext/rest-fs/`) to connect to any blong server and use it as a remote filesystem workspace — providing file browsing, editing, creation, deletion, rename, copy, and shell command execution capabilities.

Currently the REST-FS server only exists as standalone example implementations (Express, Hapi) in `ext/rest-fs/example-server/`. The goal is to integrate this as a first-class internal component in `core/blong-gogo`, following the same pattern as `Port`, `Local`, `Watch`, `Gateway`, etc.

### Success Criteria
- A new `RestFs` class in `core/blong-gogo/src/RestFs.ts` extends `Internal` (same pattern as `Port.ts`, `Local.ts`, `Watch.ts`)
- REST-FS routes are registered as a Fastify plugin on the Gateway's Fastify server instance
- Configurable via the standard blong config merge system (`restFs` config key)
- Supports all 9 REST-FS API endpoints: `stat`, `readdir`, `mkdir`, `read`, `write`, `delete`, `rename`, `copy`, `shell`
- Safe path resolution prevents directory traversal attacks
- Basic auth support consistent with the extension's auth model
- The component is wired in `load.ts` alongside other system components
- Shell command execution streams output (chunked transfer encoding)
- The VS Code extension (`ext/rest-fs`) can connect to a blong server with rest-fs enabled

### Who Uses This
- **Developers** using the rest-fs VS Code extension to remotely edit files on a blong server
- **DevOps/operators** who need remote filesystem access to blong server instances
- **Automated tooling** that needs filesystem operations via REST API

## Technical Approach

### Architecture

The RestFs component follows the established blong internal component pattern:

```
Gateway (Fastify server)
  └── RestFs plugin (registered as Fastify plugin)
       ├── GET  /api/fs/stat/*
       ├── GET  /api/fs/readdir/*
       ├── POST /api/fs/mkdir/*
       ├── GET  /api/fs/read/*
       ├── POST /api/fs/write/*
       ├── DELETE /api/fs/delete/*
       ├── POST /api/fs/rename
       ├── POST /api/fs/copy
       └── POST /api/fs/shell
```

**Key design decisions:**

1. **Fastify plugin on Gateway**: Rather than spinning up a separate HTTP server, rest-fs registers its routes on the Gateway's Fastify instance. This avoids port conflicts and leverages existing CORS, auth, and logging infrastructure.

2. **Internal class pattern**: `RestFs extends Internal` — constructed with merged config and injected dependencies (log), following `Port.ts` / `Local.ts` / `Watch.ts` patterns.

3. **Gateway integration**: The Gateway needs to expose a method (or accept a plugin registration) so RestFs can register routes on the Fastify instance. The cleanest approach is to have the Gateway accept plugin registrations before `start()`, or to have RestFs receive a reference to the Gateway and register on it.

4. **Config-driven activation**: When `restFs` config is present and not `false`, the component activates. The `baseDir` defaults to the current working directory. The `routePrefix` defaults to `/api/fs`.

5. **Authentication**: Supports the Gateway's existing auth mechanisms. The rest-fs routes can be configured with `auth: false` (no auth), `auth: 'basic'` (Basic auth matching extension's model), or `auth: 'jwt'` (JWT tokens).

6. **Shell endpoint security**: The shell endpoint is configurable separately — it can be disabled entirely (default for production), or enabled with authentication required.

### Key Interfaces

```typescript
interface IRestFsConfig {
    enabled: boolean;        // Whether rest-fs is active
    baseDir: string;         // Root directory for filesystem operations
    routePrefix: string;     // URL prefix, default '/api/fs'
    maxFileSize: number;     // Max upload size in bytes, default 50MB
    auth: false | 'basic' | 'jwt'; // Auth mode for fs routes
    shell: boolean;          // Whether shell endpoint is enabled (default false)
}
```

### Integration Points

1. **`load.ts`**: Add `restFs` to the list of system components loaded during server startup (alongside `log`, `apiSchema`, `port`, `error`, `watch`, `local`, `resolution`, `remote`, `rpcServer`, `gateway`, `registry`, `codec`, `orchestrator`, `adapter`).

2. **`Gateway.ts`**: Expose the Fastify instance (or a plugin registration method) so RestFs can add its routes. The RestFs plugin must be registered before `server.listen()`.

3. **`Registry.ts`**: Wire RestFs into the start/stop lifecycle. RestFs.start() is called after Gateway is available but before Gateway.start().

4. **`types.ts`**: Optionally add `IRestFs` interface to the blong types package.

### Technology Choices

- **Fastify**: Routes are registered as a Fastify plugin (using `fastify-plugin` for encapsulation) — aligns with existing Gateway pattern
- **Node.js `fs/promises`**: Standard library for all filesystem operations
- **Node.js `child_process.spawn`**: For shell command execution with streaming
- **`stream/promises.pipeline`**: For streaming shell output to HTTP response

## Implementation Plan

### Phase 1: Core RestFs Component (Medium)

**Task 1.1: Create `RestFs.ts`** (Medium)
- Create `core/blong-gogo/src/RestFs.ts`
- Class extends `Internal` from `@feasibleone/blong/types`
- Constructor accepts config and `{log, gateway}` dependencies
- Implements `init()`, `start()`, `stop()` lifecycle methods
- Config interface: `enabled`, `baseDir`, `routePrefix`, `maxFileSize`, `auth`, `shell`
- Safe path resolver function with directory traversal prevention

**Task 1.2: Implement Fastify plugin with filesystem routes** (Medium)
- Register as Fastify plugin on the Gateway's server instance
- Implement all 9 endpoints matching the example-server API:
  - `GET /stat/*` — file/directory metadata (type, ctime, mtime, size)
  - `GET /readdir/*` — directory listing (name, type per entry)
  - `POST /mkdir/*` — create directory (recursive)
  - `GET /read/*` — read file contents (returns binary)
  - `POST /write/*` — write file contents (accepts binary, ensures parent dirs)
  - `DELETE /delete/*` — delete file/directory (optional recursive query param)
  - `POST /rename` — rename/move (JSON body: oldPath, newPath)
  - `POST /copy` — copy file/directory (JSON body: source, destination)
  - `POST /shell` — execute shell command with streaming output (JSON body: command, cwd)
- Each route uses `config.auth` setting for authentication
- Shell endpoint is gated by `config.shell` flag

**Task 1.3: Gateway integration** (Small)
- Modify `Gateway.ts` to expose a method for registering external Fastify plugins before the server starts listening
- Add a `registerPlugin(plugin, options)` method or expose a pre-start hook
- Alternative: pass the Fastify instance reference to RestFs via constructor or a dedicated method
- The RestFs plugin must be registered in the Gateway's `start()` method, after core plugins (jwt, cors, swagger) but before `listen()`

### Phase 2: Wiring & Configuration (Small)

**Task 2.1: Wire RestFs in `load.ts`** (Small)
- Add `restFs` to the `loadedConfigs` defaults object
- Add RestFs to the server items list (lazy import pattern matching other components):
  ```typescript
  function restFs() {
      return import('./RestFs.ts');
  }
  ```
- RestFs depends on `gateway` and `log`, so it must be listed after them in the items array

**Task 2.2: Wire RestFs in `Registry.ts`** (Small)
- Add `restFs` to the Registry constructor dependencies
- Call `restFs.start()` in the Registry `start()` method (after gateway creation, before `gateway.start()`)
- Call `restFs.stop()` in the Registry `stop()` method
- Alternatively, if RestFs registers on the Gateway via plugin, it can self-manage within Gateway's lifecycle

**Task 2.3: Add configuration support** (Small)
- Default config values in `RestFs.ts` constructor
- Config merging follows the existing `this.merge(this.#config, config)` pattern
- Users can configure via suite/realm config:
  ```typescript
  config: {
      default: {
          restFs: {
              enabled: true,
              baseDir: '/path/to/workspace',
              routePrefix: '/api/fs',
              auth: false,
              shell: false,
          }
      }
  }
  ```

### Phase 3: Security & Edge Cases (Medium)

**Task 3.1: Path traversal protection** (Small)
- Validate all resolved paths start with `baseDir`
- Handle symlink attacks (use `realpath` before comparison)
- Reject paths containing `..` segments that escape the base
- Return 403 for attempts to access outside baseDir

**Task 3.2: Shell endpoint security** (Small)
- Shell endpoint disabled by default (`shell: false`)
- When enabled, always requires authentication
- Working directory validation — cwd must resolve within baseDir
- Command execution uses `spawn` with shell mode (matching example-server)
- Streaming response with proper cleanup on client disconnect

**Task 3.3: Binary content handling** (Small)
- Configure Fastify to accept `application/octet-stream` for write endpoint
- Set appropriate content limit via `maxFileSize` config
- Return raw binary for read endpoint (no JSON wrapping)

**Task 3.4: Error handling** (Small)
- File not found → 404
- Permission denied → 403
- Path traversal attempt → 403
- Invalid operations (delete non-empty dir without recursive) → 400
- Server errors → 500 with error message
- Consistent error response format: `{ error: string }`

### Phase 4: Types & Documentation (Small)

**Task 4.1: Add types** (Small)
- Add `IRestFs` interface to `core/blong/types.ts` if needed for cross-component usage
- Or keep types local to RestFs.ts if no external consumers need the interface
- Add `restFs` to `IBaseConfig` type if it should appear in config validation

**Task 4.2: Update config documentation** (Small)
- Document the `restFs` configuration block
- Document how to enable rest-fs in a suite
- Document security considerations (shell endpoint, auth modes)

**Task 4.3: Integration with VS Code extension** (Small)
- Verify the VS Code extension can connect to a blong server with rest-fs enabled
- Document the VS Code settings needed to connect:
  ```json
  {
      "restfs.workspace": {
          "my-server": {
              "baseUrl": "http://localhost:8080/api/fs"
          }
      }
  }
  ```

## Considerations

### Assumptions
- The Gateway Fastify instance is the appropriate place to register rest-fs routes (same port as the main API)
- Basic auth is sufficient for development use cases; JWT for production
- The shell endpoint will only be used in development environments
- File operations should be synchronous in terms of request-response (no background processing needed)

### Constraints
- Must not break existing Gateway behavior (RPC routes, swagger, auth)
- Must follow the existing `Internal` class pattern and config merge system
- The Fastify instance is recreated on each `gateway.start()` call (rest-fs plugin must re-register)
- Shell endpoint streaming must work with Fastify's response model

### Risks
- **Fastify plugin registration timing**: The Gateway recreates its Fastify instance on every `start()`. RestFs must be re-registered each time. This means RestFs needs to hook into Gateway's start lifecycle, or Gateway needs to call RestFs during its own start.
  - **Mitigation**: Gateway maintains a list of plugins to register on each start, RestFs adds itself during init.
- **Large file handling**: Reading/writing very large files could cause memory issues.
  - **Mitigation**: Use streaming where possible. The 50MB default limit protects against excessive uploads.
- **Shell command injection**: The shell endpoint executes arbitrary commands.
  - **Mitigation**: Disabled by default; requires auth when enabled; cwd validated within baseDir.

## Not Included

- **File watching/change notifications**: No WebSocket-based file change notifications (could be added later for real-time collaboration)
- **Access control per path**: No fine-grained per-path permissions (all authenticated users have full access)
- **Quota management**: No disk space limits or per-user quotas
- **File search/grep**: No server-side search functionality
- **Git integration**: No built-in git operations through the REST API
- **Multi-tenant isolation**: Single baseDir per server instance
