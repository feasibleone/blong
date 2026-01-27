# Hapi Middleware for REST Filesystem

This directory includes Hapi-based implementations of the REST filesystem API.

## Files

- **`restfs-plugin.js`** - Reusable Hapi plugin for REST filesystem operations
- **`server-hapi.js`** - Standalone Hapi server with inline implementation
- **`server-with-plugin.js`** - Example server using the plugin (recommended)
- **`server.js`** - Original Express-based implementation

## Quick Start

### Option 1: Using the Plugin (Recommended)

```bash
npm install
npm run start:plugin
```

### Option 2: Standalone Hapi Server

```bash
npm install
npm run start:hapi
```

### Option 3: Express Server

```bash
npm install
npm start
```

## Using the Plugin in Your Own Hapi Application

```javascript
const Hapi = require('@hapi/hapi');
const restFsPlugin = require('./restfs-plugin');
const path = require('path');

const server = Hapi.server({
    port: 3000,
    host: 'localhost',
    routes: {
        cors: {
            origin: ['*']
        }
    }
});

// Register the REST filesystem plugin
await server.register({
    plugin: restFsPlugin,
    options: {
        baseDir: path.join(__dirname, 'data'),  // Required
        routePrefix: '/api/fs',                  // Optional, default: '/api/fs'
        maxFileSize: 52428800                    // Optional, default: 50MB
    }
});

await server.start();
```

## Plugin Options

- **`baseDir`** (required): Base directory for the virtual filesystem
- **`routePrefix`** (optional): URL prefix for all routes. Default: `/api/fs`
- **`maxFileSize`** (optional): Maximum file upload size in bytes.
  Default: 52428800 (50MB)

## API Endpoints

All endpoints are prefixed with the `routePrefix` option (default: `/api/fs`):

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| GET | `/stat/{path*}` | Get file/directory metadata |
| GET | `/readdir/{path*}` | List directory contents |
| POST | `/mkdir/{path*}` | Create directory |
| GET | `/read/{path*}` | Read file contents |
| POST | `/write/{path*}` | Write file contents |
| DELETE | `/delete/{path*}` | Delete file or directory |
| POST | `/rename` | Rename/move file or directory |
| POST | `/copy` | Copy file or directory |

## Features

✅ Fully compatible with the REST Filesystem VS Code extension
✅ CORS enabled for cross-origin requests
✅ Safe path resolution (prevents directory traversal)
✅ Configurable base directory and route prefix
✅ Support for binary file uploads
✅ Recursive directory operations

## Dependencies

```bash
npm install @hapi/hapi
```

## Testing with VS Code Extension

1. Start the Hapi server: `npm run start:plugin`
2. Configure VS Code extension to use: `http://localhost:3000/api/fs`
3. Open REST filesystem: Command Palette → `REST FS: Open Workspace`

## Security Notes

⚠️ This is a development server. For production use:

- Add authentication/authorization
- Implement rate limiting
- Add input validation
- Configure CORS properly
- Use HTTPS
- Add logging and monitoring
