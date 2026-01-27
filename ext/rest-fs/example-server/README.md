# Example REST Server

This directory contains multiple implementations of the REST API server for the REST Filesystem extension.

## Available Implementations

1. **Express** - Original implementation (`server.js`)
2. **Hapi** - Full Hapi server (`server-hapi.js`)
3. **Hapi Plugin** - Reusable plugin (`restfs-plugin.js` + `server-with-plugin.js`)

## Installation

```bash
cd example-server
npm install
```

## Running the Server

### Express Server (Default)
```bash
npm start
```

### Hapi Server
```bash
npm run start:hapi
```

### Hapi with Plugin (Recommended)
```bash
npm run start:plugin
```

All servers run on `http://localhost:3000` and create a `data/` directory with sample files.

## Hapi Plugin

See [HAPI.md](HAPI.md) for detailed documentation on using the Hapi plugin in your own application.

## Testing

Once any server is running:

1. Open VS Code with the REST Filesystem extension
2. Configure the endpoint: `http://localhost:3000/api/fs`
3. Run command: `REST FS: Open Workspace`
4. You should see the sample files in the `data/` directory

## API Endpoints

The server implements all required endpoints:

- `GET /api/fs/stat/*` - Get file/directory metadata
- `GET /api/fs/readdir/*` - List directory contents
- `POST /api/fs/mkdir/*` - Create directory
- `GET /api/fs/read/*` - Read file contents
- `POST /api/fs/write/*` - Write file contents
- `DELETE /api/fs/delete/*` - Delete file or directory
- `POST /api/fs/rename` - Rename/move file or directory
- `POST /api/fs/copy` - Copy file or directory

## Data Directory

The server uses the `data/` subdirectory as the root of the virtual filesystem. All file operations are performed within this directory.
