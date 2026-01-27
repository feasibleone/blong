const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Base directory for the virtual filesystem
const BASE_DIR = path.join(__dirname, 'data');

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.raw({type: 'application/octet-stream', limit: '50mb'}));

// CORS for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Helper to resolve paths safely
function resolvePath(requestPath) {
    const safePath = path.join(BASE_DIR, requestPath || '/');
    if (!safePath.startsWith(BASE_DIR)) {
        throw new Error('Invalid path');
    }
    return safePath;
}

// GET /stat/:path - Get file/directory metadata
app.get('/api/fs/stat/*', async (req, res) => {
    try {
        const requestPath = req.params[0] || '/';
        const fullPath = resolvePath(requestPath);

        const stats = await fs.stat(fullPath);

        res.json({
            type: stats.isDirectory() ? 'directory' : 'file',
            ctime: stats.ctimeMs,
            mtime: stats.mtimeMs,
            size: stats.size,
        });
    } catch (error) {
        res.status(404).json({error: 'Not found'});
    }
});

// GET /readdir/:path - List directory contents
app.get('/api/fs/readdir/*', async (req, res) => {
    try {
        const requestPath = req.params[0] || '/';
        const fullPath = resolvePath(requestPath);

        const entries = await fs.readdir(fullPath, {withFileTypes: true});

        const result = entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
        }));

        res.json(result);
    } catch (error) {
        res.status(404).json({error: 'Directory not found'});
    }
});

// POST /mkdir/:path - Create directory
app.post('/api/fs/mkdir/*', async (req, res) => {
    try {
        const requestPath = req.params[0] || '/';
        const fullPath = resolvePath(requestPath);

        await fs.mkdir(fullPath, {recursive: true});
        res.json({success: true});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
});

// GET /read/:path - Read file contents
app.get('/api/fs/read/*', async (req, res) => {
    try {
        const requestPath = req.params[0] || '/';
        const fullPath = resolvePath(requestPath);

        const content = await fs.readFile(fullPath);
        res.send(content);
    } catch (error) {
        res.status(404).json({error: 'File not found'});
    }
});

// POST /write/:path - Write file contents
app.post('/api/fs/write/*', async (req, res) => {
    try {
        const requestPath = req.params[0] || '/';
        const fullPath = resolvePath(requestPath);

        // Ensure parent directory exists
        await fs.mkdir(path.dirname(fullPath), {recursive: true});

        await fs.writeFile(fullPath, req.body);
        res.json({success: true});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
});

// DELETE /delete/:path - Delete file or directory
app.delete('/api/fs/delete/*', async (req, res) => {
    try {
        const requestPath = req.params[0] || '/';
        const fullPath = resolvePath(requestPath);
        const recursive = req.query.recursive === 'true';

        const stats = await fs.stat(fullPath);

        if (stats.isDirectory()) {
            await fs.rm(fullPath, {recursive});
        } else {
            await fs.unlink(fullPath);
        }

        res.json({success: true});
    } catch (error) {
        res.status(404).json({error: 'Not found'});
    }
});

// POST /rename - Rename/move file or directory
app.post('/api/fs/rename', async (req, res) => {
    try {
        const {oldPath, newPath} = req.body;
        const oldFullPath = resolvePath(oldPath);
        const newFullPath = resolvePath(newPath);

        await fs.rename(oldFullPath, newFullPath);
        res.json({success: true});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
});

// POST /copy - Copy file or directory
app.post('/api/fs/copy', async (req, res) => {
    try {
        const {source, destination} = req.body;
        const sourceFullPath = resolvePath(source);
        const destFullPath = resolvePath(destination);

        const stats = await fs.stat(sourceFullPath);

        if (stats.isDirectory()) {
            await fs.cp(sourceFullPath, destFullPath, {recursive: true});
        } else {
            await fs.copyFile(sourceFullPath, destFullPath);
        }

        res.json({success: true});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
});

// Initialize base directory
async function initialize() {
    try {
        await fs.mkdir(BASE_DIR, {recursive: true});

        // Create some sample files
        await fs.writeFile(
            path.join(BASE_DIR, 'welcome.txt'),
            'Welcome to REST Filesystem!\n\nThis is a sample file.',
        );

        await fs.mkdir(path.join(BASE_DIR, 'sample-folder'), {recursive: true});
        await fs.writeFile(
            path.join(BASE_DIR, 'sample-folder', 'readme.md'),
            '# Sample Folder\n\nThis is a sample markdown file in a subfolder.',
        );

        console.log(`REST Filesystem server running on http://localhost:${PORT}`);
        console.log(`Base directory: ${BASE_DIR}`);
        console.log('\nAPI endpoints:');
        console.log('  GET  /api/fs/stat/*');
        console.log('  GET  /api/fs/readdir/*');
        console.log('  POST /api/fs/mkdir/*');
        console.log('  GET  /api/fs/read/*');
        console.log('  POST /api/fs/write/*');
        console.log('  DELETE /api/fs/delete/*');
        console.log('  POST /api/fs/rename');
        console.log('  POST /api/fs/copy');
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

app.listen(PORT, () => {
    initialize();
});
