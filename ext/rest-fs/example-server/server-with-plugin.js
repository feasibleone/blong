const Hapi = require('@hapi/hapi');
const path = require('path');
const fs = require('fs').promises;
const restFsPlugin = require('./restfs-plugin');

/**
 * Initialize base directory with sample files
 */
async function initializeSampleData(baseDir) {
    try {
        await fs.mkdir(baseDir, { recursive: true });

        // Create some sample files
        await fs.writeFile(
            path.join(baseDir, 'welcome.txt'),
            'Welcome to REST Filesystem with Hapi!\n\nThis is a sample file.'
        );

        await fs.mkdir(path.join(baseDir, 'sample-folder'), { recursive: true });
        await fs.writeFile(
            path.join(baseDir, 'sample-folder', 'readme.md'),
            '# Sample Folder\n\nThis is a sample markdown file in a subfolder.'
        );

        console.log('Sample files created successfully');
    } catch (error) {
        console.error('Failed to initialize sample data:', error);
    }
}

/**
 * Start the Hapi server with REST filesystem plugin
 */
const init = async () => {
    const baseDir = path.join(__dirname, 'data');

    const server = Hapi.server({
        port: 3000,
        host: 'localhost',
        routes: {
            cors: {
                origin: ['*'],
                headers: ['Accept', 'Content-Type', 'Authorization'],
                additionalHeaders: ['X-Requested-With']
            }
        }
    });

    // Register the REST filesystem plugin
    await server.register({
        plugin: restFsPlugin,
        options: {
            baseDir: baseDir,
            routePrefix: '/api/fs',
            maxFileSize: 52428800 // 50MB
        }
    });

    // Initialize sample data
    await initializeSampleData(baseDir);

    await server.start();
    console.log(`\n✓ Server running on ${server.info.uri}`);
    console.log('\nAvailable REST filesystem endpoints:');
    console.log('  GET    /api/fs/stat/{path*}');
    console.log('  GET    /api/fs/readdir/{path*}');
    console.log('  POST   /api/fs/mkdir/{path*}');
    console.log('  GET    /api/fs/read/{path*}');
    console.log('  POST   /api/fs/write/{path*}');
    console.log('  DELETE /api/fs/delete/{path*}');
    console.log('  POST   /api/fs/rename');
    console.log('  POST   /api/fs/copy');
};

process.on('unhandledRejection', (err) => {
    console.error(err);
    process.exit(1);
});

init();
