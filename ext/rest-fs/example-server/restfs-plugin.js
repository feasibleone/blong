const fs = require('fs').promises;
const path = require('path');

/**
 * Hapi plugin for REST filesystem operations
 *
 * Usage:
 *
 * const server = Hapi.server({ ... });
 * await server.register({
 *   plugin: require('./restfs-plugin'),
 *   options: {
 *     baseDir: path.join(__dirname, 'data'),
 *     routePrefix: '/api/fs'
 *   }
 * });
 */

/**
 * Helper to resolve paths safely within the base directory
 */
function createPathResolver(baseDir) {
    return function resolvePath(requestPath) {
        const safePath = path.join(baseDir, requestPath || '/');
        if (!safePath.startsWith(baseDir)) {
            throw new Error('Invalid path');
        }
        return safePath;
    };
}

const plugin = {
    name: 'rest-fs',
    version: '1.0.0',

    register: async function (server, options) {
        const baseDir = options.baseDir || path.join(process.cwd(), 'data');
        const routePrefix = options.routePrefix || '/api/fs';
        const resolvePath = createPathResolver(baseDir);

        // Ensure base directory exists
        await fs.mkdir(baseDir, {recursive: true});

        // GET /stat/{path*} - Get file/directory metadata
        server.route({
            method: 'GET',
            path: `${routePrefix}/stat/{path*}`,
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
            path: `${routePrefix}/readdir/{path*}`,
            handler: async (request, h) => {
                try {
                    const requestPath = request.params.path || '/';
                    const fullPath = resolvePath(requestPath);

                    const entries = await fs.readdir(fullPath, {withFileTypes: true});

                    return entries.map(entry => ({
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file',
                    }));
                } catch (error) {
                    return h.response({error: 'Directory not found'}).code(404);
                }
            },
        });

        // POST /mkdir/{path*} - Create directory
        server.route({
            method: 'POST',
            path: `${routePrefix}/mkdir/{path*}`,
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
            path: `${routePrefix}/read/{path*}`,
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
            path: `${routePrefix}/write/{path*}`,
            options: {
                payload: {
                    output: 'data',
                    parse: false,
                    allow: 'application/octet-stream',
                    maxBytes: options.maxFileSize || 52428800, // Default 50MB
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
            path: `${routePrefix}/delete/{path*}`,
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
            path: `${routePrefix}/rename`,
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
            path: `${routePrefix}/copy`,
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

        console.log(`REST Filesystem plugin registered at ${routePrefix}`);
        console.log(`Base directory: ${baseDir}`);
    },
};

module.exports = plugin;
