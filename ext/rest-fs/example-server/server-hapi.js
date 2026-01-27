const Hapi = require('@hapi/hapi');
const fs = require('fs').promises;
const path = require('path');

// Base directory for the virtual filesystem
const BASE_DIR = path.join(__dirname, 'data');

/**
 * Helper to resolve paths safely
 */
function resolvePath(requestPath) {
    const safePath = path.join(BASE_DIR, requestPath || '/');
    if (!safePath.startsWith(BASE_DIR)) {
        throw new Error('Invalid path');
    }
    return safePath;
}

/**
 * Hapi plugin that implements REST filesystem operations
 */
const restFsPlugin = {
    name: 'rest-fs',
    version: '1.0.0',
    register: async function (server, options) {
        // GET /stat/{path*} - Get file/directory metadata
        server.route({
            method: 'GET',
            path: '/api/fs/stat/{path*}',
            handler: async (request, h) => {
                try {
                    const requestPath = request.params.path || '/';
                    const fullPath = resolvePath(requestPath);

                    const stats = await fs.stat(fullPath);

                    return {
                        type: stats.isDirectory() ? 'directory' : 'file',
                        ctime: stats.ctimeMs,
                        mtime: stats.mtimeMs,
                        size: stats.size,
                    };
                } catch (error) {
                    return h.response({error: 'Not found'}).code(404);
                }
            },
        });

        // GET /readdir/{path*} - List directory contents
        server.route({
            method: 'GET',
            path: '/api/fs/readdir/{path*}',
            handler: async (request, h) => {
                try {
                    const requestPath = request.params.path || '/';
                    const fullPath = resolvePath(requestPath);

                    const entries = await fs.readdir(fullPath, {withFileTypes: true});

                    const result = entries.map(entry => ({
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file',
                    }));

                    return result;
                } catch (error) {
                    return h.response({error: 'Directory not found'}).code(404);
                }
            },
        });

        // POST /mkdir/{path*} - Create directory
        server.route({
            method: 'POST',
            path: '/api/fs/mkdir/{path*}',
            handler: async (request, h) => {
                try {
                    const requestPath = request.params.path || '/';
                    const fullPath = resolvePath(requestPath);

                    await fs.mkdir(fullPath, {recursive: true});
                    return {success: true};
                } catch (error) {
                    return h.response({error: error.message}).code(500);
                }
            },
        });

        // GET /read/{path*} - Read file contents
        server.route({
            method: 'GET',
            path: '/api/fs/read/{path*}',
            handler: async (request, h) => {
                try {
                    const requestPath = request.params.path || '/';
                    const fullPath = resolvePath(requestPath);

                    const content = await fs.readFile(fullPath);
                    return h.response(content).type('application/octet-stream');
                } catch (error) {
                    return h.response({error: 'File not found'}).code(404);
                }
            },
        });

        // POST /write/{path*} - Write file contents
        server.route({
            method: 'POST',
            path: '/api/fs/write/{path*}',
            options: {
                payload: {
                    output: 'data',
                    parse: false,
                    allow: 'application/octet-stream',
                    maxBytes: 52428800, // 50MB
                },
            },
            handler: async (request, h) => {
                try {
                    const requestPath = request.params.path || '/';
                    const fullPath = resolvePath(requestPath);

                    // Ensure parent directory exists
                    await fs.mkdir(path.dirname(fullPath), {recursive: true});

                    await fs.writeFile(fullPath, request.payload);
                    return {success: true};
                } catch (error) {
                    return h.response({error: error.message}).code(500);
                }
            },
        });

        // DELETE /delete/{path*} - Delete file or directory
        server.route({
            method: 'DELETE',
            path: '/api/fs/delete/{path*}',
            handler: async (request, h) => {
                try {
                    const requestPath = request.params.path || '/';
                    const fullPath = resolvePath(requestPath);
                    const recursive = request.query.recursive === 'true';

                    const stats = await fs.stat(fullPath);

                    if (stats.isDirectory()) {
                        await fs.rm(fullPath, {recursive});
                    } else {
                        await fs.unlink(fullPath);
                    }

                    return {success: true};
                } catch (error) {
                    return h.response({error: 'Not found'}).code(404);
                }
            },
        });

        // POST /rename - Rename/move file or directory
        server.route({
            method: 'POST',
            path: '/api/fs/rename',
            handler: async (request, h) => {
                try {
                    const {oldPath, newPath} = request.payload;
                    const oldFullPath = resolvePath(oldPath);
                    const newFullPath = resolvePath(newPath);

                    await fs.rename(oldFullPath, newFullPath);
                    return {success: true};
                } catch (error) {
                    return h.response({error: error.message}).code(500);
                }
            },
        });

        // POST /copy - Copy file or directory
        server.route({
            method: 'POST',
            path: '/api/fs/copy',
            handler: async (request, h) => {
                try {
                    const {source, destination} = request.payload;
                    const sourceFullPath = resolvePath(source);
                    const destFullPath = resolvePath(destination);

                    const stats = await fs.stat(sourceFullPath);

                    if (stats.isDirectory()) {
                        await fs.cp(sourceFullPath, destFullPath, {recursive: true});
                    } else {
                        await fs.copyFile(sourceFullPath, destFullPath);
                    }

                    return {success: true};
                } catch (error) {
                    return h.response({error: error.message}).code(500);
                }
            },
        });
    },
};

/**
 * Initialize base directory and create sample files
 */
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

        console.log(`Base directory: ${BASE_DIR}`);
        console.log('Sample files created successfully');
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

/**
 * Start the Hapi server
 */
const init = async () => {
    const server = Hapi.server({
        port: 3000,
        host: 'localhost',
        routes: {
            cors: {
                origin: ['*'],
                headers: ['Accept', 'Content-Type', 'Authorization'],
                additionalHeaders: ['X-Requested-With'],
            },
        },
    });

    // Register the REST filesystem plugin
    await server.register(restFsPlugin);

    // Initialize data directory
    await initialize();

    await server.start();
    console.log(`REST Filesystem server running on ${server.info.uri}`);
    console.log('\nAPI endpoints:');
    console.log('  GET    /api/fs/stat/{path*}');
    console.log('  GET    /api/fs/readdir/{path*}');
    console.log('  POST   /api/fs/mkdir/{path*}');
    console.log('  GET    /api/fs/read/{path*}');
    console.log('  POST   /api/fs/write/{path*}');
    console.log('  DELETE /api/fs/delete/{path*}');
    console.log('  POST   /api/fs/rename');
    console.log('  POST   /api/fs/copy');
};

process.on('unhandledRejection', err => {
    console.log(err);
    process.exit(1);
});

init();
