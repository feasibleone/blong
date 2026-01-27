# Quick Start Guide

## Getting Started

### 1. Start the Example Server

```bash
cd example-server
npm install
npm start
```

The server will run on `http://localhost:3000` and create sample files.

### 2. Run the Extension

Press `F5` in VS Code to launch the extension in debug mode.

### 3. Open REST Filesystem

- Open Command Palette (`Ctrl+Shift+P`)
- Run: `REST FS: Open Workspace`
- Browse and edit files from `restfs://`

## Configuration

Configure via VS Code settings or run `REST FS: Configure API Endpoint`:

```json
{
  "restfs.baseUrl": "http://localhost:3000/api/fs",
  "restfs.headers": {
    "Authorization": "Bearer your-token"
  }
}
```

## Features

✅ Read files and directories
✅ Write and create files
✅ Delete files and directories
✅ Rename and move files
✅ Copy files and directories
✅ VS Code integration (syntax highlighting, IntelliSense, etc.)

## Testing

Try editing the sample files created by the server:

- `restfs:/welcome.txt`
- `restfs:/sample-folder/readme.md`

All changes are persisted to the server's `data/` directory.
