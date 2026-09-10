import {adapter} from '@feasibleone/blong';
import type {IncomingMessage, Server, ServerResponse} from 'node:http';
import {createServer} from 'node:http';

let _server: Server | null = null;

export default adapter(() => ({
    activation: {
        default: {},
        'adapter.http': {
            namespace: 'sim',
            imports: [],
        },
    },
    async start() {
        _server = createServer((req: IncomingMessage, res: ServerResponse) => {
            let body = '';
            req.on('data', (chunk: Buffer) => {
                body += chunk.toString();
            });
            req.on('end', () => {
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(
                    JSON.stringify({
                        echo: true,
                        url: req.url,
                        method: req.method,
                        body: body || undefined,
                    }),
                );
            });
        });
        await new Promise<void>(resolve =>
            _server!.listen(30088, '127.0.0.1', resolve as () => void),
        );
        super.connect();
        return super.start();
    },
    async stop(...params: unknown[]) {
        let result;
        try {
            await new Promise<void>(resolve => _server?.close(() => resolve()) ?? resolve());
        } finally {
            _server = null;
            result = await super.stop(...params);
        }
        return result;
    },
}));
