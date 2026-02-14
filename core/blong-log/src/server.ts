/**
 * Log server: combines UDP receiver, circular buffer, REST API and WebSocket.
 *
 * This is the main entry point for the blong-log server.
 */

import {readFile} from 'node:fs/promises';
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http';
import {extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer, type WebSocket} from 'ws';

import {CircularBuffer} from './buffer.js';
import {
    LEVEL_MAP,
    type ClientConfig,
    type FilterOptions,
    type LogEntry,
    type LogServerOptions,
    type WsMessage,
} from './types.js';
import {UdpReceiver} from './udp-receiver.js';

const DEFAULT_OPTIONS: Required<LogServerOptions> = {
    udpPort: 9999,
    httpPort: 9998,
    host: '127.0.0.1',
    bufferSize: 10000,
    recentCount: 200,
    maxPacketSize: 65507,
    properties: {
        timestamp: 'time',
        level: 'level',
        name: 'name',
        traceId: 'traceId',
        error: 'err',
        request: 'req',
        response: 'res',
    },
    traceUrlPattern: '',
    theme: {
        mode: 'dark',
        levels: {
            trace: '#6b7280',
            debug: '#3b82f6',
            info: '#22c55e',
            warn: '#eab308',
            error: '#ef4444',
            fatal: '#dc2626',
        },
        syntax: {
            string: '#a5d6ff',
            number: '#79c0ff',
            boolean: '#ff7b72',
            null: '#6b7280',
            key: '#d2a8ff',
        },
    },
    clientPath: '/',
};

interface ConnectedClient {
    ws: WebSocket;
    filters: FilterOptions;
}

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

export class LogServer {
    readonly #options: Required<LogServerOptions>;
    readonly #buffer: CircularBuffer;
    readonly #udpReceiver: UdpReceiver;
    readonly #clients: Set<ConnectedClient> = new Set();
    #httpServer: Server | null = null;
    #wss: WebSocketServer | null = null;
    #publicDir: string;

    constructor(options: LogServerOptions = {}) {
        this.#options = {...DEFAULT_OPTIONS, ...options} as Required<LogServerOptions>;
        this.#options.properties = {...DEFAULT_OPTIONS.properties, ...options.properties};
        this.#options.theme = {...DEFAULT_OPTIONS.theme, ...options.theme};

        this.#buffer = new CircularBuffer(this.#options.bufferSize);
        this.#udpReceiver = new UdpReceiver({
            port: this.#options.udpPort,
            host: this.#options.host,
        });
        this.#publicDir = join(fileURLToPath(import.meta.url), '../../public');
    }

    /**
     * Start the log server (UDP receiver + HTTP/WebSocket server).
     */
    async start(): Promise<{httpPort: number; udpPort: number}> {
        // Start UDP receiver
        this.#udpReceiver.on('entry', (raw: Record<string, unknown>) => {
            const entry = this.#buffer.add(raw);
            this.#broadcastEntry(entry);
        });

        this.#udpReceiver.on('error', (err: Error) => {
            console.error('[blong-log] UDP receiver error:', err.message);
        });

        await this.#udpReceiver.start();

        // Start HTTP server
        this.#httpServer = createServer((req, res) => this.#handleHttp(req, res));

        // Attach WebSocket server
        this.#wss = new WebSocketServer({server: this.#httpServer});
        this.#wss.on('connection', (ws: WebSocket) => this.#handleWsConnection(ws));

        await new Promise<void>((resolve, reject) => {
            this.#httpServer!.listen(this.#options.httpPort, this.#options.host, () => resolve());
            this.#httpServer!.once('error', reject);
        });

        const addr = this.#httpServer!.address();
        const httpPort = typeof addr === 'object' && addr ? addr.port : this.#options.httpPort;

        return {httpPort, udpPort: this.#options.udpPort};
    }

    /**
     * Stop the log server.
     */
    async stop(): Promise<void> {
        // Close all WebSocket clients
        for (const client of this.#clients) {
            client.ws.close();
        }
        this.#clients.clear();

        // Close WebSocket server
        if (this.#wss) {
            this.#wss.close();
            this.#wss = null;
        }

        // Close HTTP server
        if (this.#httpServer) {
            await new Promise<void>(resolve => {
                this.#httpServer!.close(() => resolve());
            });
            this.#httpServer = null;
        }

        // Stop UDP receiver
        await this.#udpReceiver.stop();
    }

    /**
     * Programmatically add a log entry (useful for testing or direct integration).
     */
    addEntry(raw: Record<string, unknown>): LogEntry {
        const entry = this.#buffer.add(raw);
        this.#broadcastEntry(entry);
        return entry;
    }

    /**
     * Get the client configuration for the UI.
     */
    getClientConfig(): ClientConfig {
        return {
            wsUrl: `ws://${this.#options.host}:${this.#options.httpPort}/ws`,
            apiUrl: `http://${this.#options.host}:${this.#options.httpPort}/api`,
            properties: this.#options.properties,
            recentCount: this.#options.recentCount,
            traceUrlPattern: this.#options.traceUrlPattern,
            theme: this.#options.theme,
        };
    }

    // ── HTTP request handler ──────────────────────────────────────────────

    async #handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        const path = url.pathname;

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // REST API routes
        if (path === '/api/config') {
            return this.#sendJson(res, this.getClientConfig());
        }

        if (path === '/api/entries') {
            const filters = this.#parseFilters(url.searchParams);
            const entries = this.#buffer.getRecent(filters);
            return this.#sendJson(res, {entries, total: this.#buffer.size});
        }

        if (path === '/api/search') {
            const filters = this.#parseFilters(url.searchParams);
            const entries = this.#buffer.query(filters);
            return this.#sendJson(res, {entries, total: entries.length});
        }

        // Serve client-side assets
        await this.#serveStatic(req, res, path);
    }

    #parseFilters(params: URLSearchParams): FilterOptions {
        const filters: FilterOptions = {};
        if (params.has('level')) filters.level = params.get('level')!;
        if (params.has('name')) filters.name = params.get('name')!;
        if (params.has('traceId')) filters.traceId = params.get('traceId')!;
        if (params.has('search')) filters.search = params.get('search')!;
        if (params.has('after')) filters.after = params.get('after')!;
        if (params.has('limit')) filters.limit = parseInt(params.get('limit')!, 10);

        // Parse custom properties
        for (const [key, value] of params) {
            if (!['level', 'name', 'traceId', 'search', 'after', 'limit'].includes(key)) {
                filters.properties = filters.properties ?? {};
                filters.properties[key] = value;
            }
        }

        return filters;
    }

    #sendJson(res: ServerResponse, data: unknown): void {
        const body = JSON.stringify(data);
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
    }

    async #serveStatic(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
        let filePath = path === '/' ? '/index.html' : path;
        filePath = join(this.#publicDir, filePath);

        try {
            const content = await readFile(filePath);
            const ext = extname(filePath);
            const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': content.length,
            });
            res.end(content);
        } catch {
            // If file not found, serve index.html (SPA fallback)
            try {
                const indexPath = join(this.#publicDir, 'index.html');
                const content = await readFile(indexPath);
                res.writeHead(200, {
                    'Content-Type': 'text/html',
                    'Content-Length': content.length,
                });
                res.end(content);
            } catch {
                res.writeHead(404, {'Content-Type': 'text/plain'});
                res.end('Not Found');
            }
        }
    }

    // ── WebSocket handler ─────────────────────────────────────────────────

    #handleWsConnection(ws: WebSocket): void {
        const client: ConnectedClient = {ws, filters: {}};
        this.#clients.add(client);

        // Send configuration on connect
        const configMsg: WsMessage = {type: 'config', config: this.getClientConfig()};
        ws.send(JSON.stringify(configMsg));

        ws.on('message', (data: Buffer | string) => {
            try {
                const msg: WsMessage = JSON.parse(data.toString());
                this.#handleWsMessage(client, msg);
            } catch {
                // Ignore malformed messages
            }
        });

        ws.on('close', () => {
            this.#clients.delete(client);
        });

        ws.on('error', () => {
            this.#clients.delete(client);
        });
    }

    #handleWsMessage(client: ConnectedClient, msg: WsMessage): void {
        switch (msg.type) {
            case 'subscribe': {
                client.filters = msg.filters ?? {};
                // Send recent entries matching the new filters
                const entries = this.#buffer.getRecent({
                    ...client.filters,
                    limit: this.#options.recentCount,
                });
                const response: WsMessage = {type: 'entries', entries};
                client.ws.send(JSON.stringify(response));
                break;
            }
            case 'unsubscribe':
                client.filters = {};
                break;
        }
    }

    // ── Broadcasting ──────────────────────────────────────────────────────

    #broadcastEntry(entry: LogEntry): void {
        for (const client of this.#clients) {
            if (this.#entryMatchesFilters(entry, client.filters)) {
                const msg: WsMessage = {type: 'entry', entry};
                try {
                    client.ws.send(JSON.stringify(msg));
                } catch {
                    // Remove disconnected clients
                    this.#clients.delete(client);
                }
            }
        }
    }

    #entryMatchesFilters(entry: LogEntry, filters: FilterOptions): boolean {
        if (filters.level) {
            const minLevel = LEVEL_MAP[filters.level] ?? 0;
            if ((entry.level ?? 0) < minLevel) return false;
        }

        if (filters.name) {
            if (!entry.name?.toLowerCase().includes(filters.name.toLowerCase())) return false;
        }

        if (filters.traceId) {
            if (entry.traceId !== filters.traceId) return false;
        }

        if (filters.search) {
            const text = JSON.stringify(entry).toLowerCase();
            if (!text.includes(filters.search.toLowerCase())) return false;
        }

        if (filters.properties) {
            for (const [key, value] of Object.entries(filters.properties)) {
                if (String(entry[key] ?? '') !== value) return false;
            }
        }

        if (filters.after && entry.id <= filters.after) return false;

        return true;
    }
}
