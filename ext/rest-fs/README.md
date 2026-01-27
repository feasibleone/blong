# REST Filesystem VS Code Extension

A VS Code extension that implements a custom filesystem backed by REST API. This allows you to browse, read, write, and manage files and directories on a remote server through a standard REST interface.

## Features

- **Full FileSystemProvider Implementation**: Complete support for VS Code's filesystem API
- **REST API Backend**: All filesystem operations are performed via HTTP requests
- **Configurable Endpoint**: Easy configuration of the REST API base URL and custom headers
- **Standard Operations**: Support for read, write, delete, rename, copy, and directory operations

## Installation

1. Clone this repository
2. Run `npm install`
3. Press `F5` to run the extension in debug mode

## Configuration

Configure the REST API endpoint through VS Code settings:

```json
{
  "restfs": {
    "workspace": {
      "example": {
          "baseUrl": "http://localhost:3000/api/fs",
          "headers": {
              "Authorization": "Basic ..."
          }
      }
    }
  }
}
```

Or use the command palette:

- `REST FS: Add Workspace`
- `REST FS: Configure API Endpoint`
- `REST FS: Open Workspace`

## Usage

1. Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run `REST FS: Open Workspace` and select a configured workspace
3. Your remote filesystem will be mounted with the `restfs://` scheme
4. Browse and edit files as if they were local

You can also manually open files using URIs like:

- `restfs://example/path/to/file.txt`
- `restfs://example/folder/`

## REST API Endpoints

Your REST API backend should implement the following endpoints:

### GET /stat{path}

Returns metadata about a file or directory.

**Response:**

```json
{
  "type": "file" | "directory",
  "ctime": 1234567890,
  "mtime": 1234567890,
  "size": 1024
}
```

### GET /readdir{path}

Lists the contents of a directory.

**Response:**

```json
[
  { "name": "file.txt", "type": "file" },
  { "name": "subfolder", "type": "directory" }
]
```

### POST /mkdir{path}

Creates a new directory.

### GET /read{path}

Returns the contents of a file as binary data.

### POST /write{path}

Writes binary data to a file.

- Content-Type: `application/octet-stream`
- Body: Binary file contents

### DELETE /delete{path}?recursive=true|false

Deletes a file or directory.

### POST /rename

Renames or moves a file/directory.

**Request Body:**

```json
{
  "oldPath": "/old/path",
  "newPath": "/new/path",
  "overwrite": true
}
```

### POST /copy

Copies a file or directory.

**Request Body:**

```json
{
  "source": "/source/path",
  "destination": "/dest/path",
  "overwrite": true
}
```

## Example REST Server

See the [example-server/](example-server/) directory for a sample Node.js REST API server implementation that you can use for testing.

## Development

### Build

```bash
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Run Tests

```bash
npm test
```

### Package Extension

```bash
npm run package
```

## Requirements

- VS Code version 1.107.0 or higher
- A compatible REST API backend server

## Extension Commands

- `REST FS: Add Workspace` - Add a new workspace configuration
- `REST FS: Configure API Endpoint` - Configure the REST API base URL and credentials
- `REST FS: Open Workspace` - Opens the REST filesystem as a workspace

## License

MIT
