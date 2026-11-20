/**
 * Running the service inside another process.
 *
 * The service is the central half of the design: emitters write records beside their local writer
 * and the service turns them into signals, flows, diagrams and a change stream. It is one process in
 * development and in tests, and a deployed service in production — and the *same* configuration
 * shape describes both, because the sink reaches it by URL wherever it runs. That is what keeps the
 * two cases one path instead of two.
 *
 * `undefined` means "not started", never "throw": a process whose telemetry aid could not open a
 * socket still has its records on its own writer, and refusing to run over that would make the aid
 * more important than the work. Every failure here is reported and swallowed.
 *
 * The bound port is read back from the socket rather than assumed, so a caller that asks for port
 * `0` — every test does, because two services on one machine must not collide — still learns the URL
 * it has to point the sink at.
 */

import type {FastifyInstance} from 'fastify';
import type {AddressInfo} from 'node:net';
import {createApp, type ServiceOptions} from './app.ts';

/** The port an in-process service binds when none is configured. */
export const DEFAULT_SERVICE_PORT = 9455;

export interface StartServiceOptions extends ServiceOptions {
    /**
     * The port to bind. `0` asks the operating system for a free one, which is what a test wants:
     * the URL is read back from the socket either way.
     */
    port?: number;
    /** The interface to bind. Loopback by default: an aid, not a public service. */
    host?: string;
    /**
     * Called once, with the reason, when the service could not be started — a port already in use
     * being the ordinary case, since a second process in the same workspace is not an error.
     */
    onError?: (error: unknown) => void;
}

export interface RunningService {
    /** The service itself, for a caller that wants to query it in-process. */
    app: FastifyInstance;
    /** Where the sink should send records, e.g. `http://127.0.0.1:9455`. */
    url: string;
    /** Close the service. */
    stop: () => Promise<void>;
}

export async function startService(
    options: StartServiceOptions = {},
): Promise<RunningService | undefined> {
    const port = options.port ?? DEFAULT_SERVICE_PORT;
    const host = options.host ?? '127.0.0.1';
    const {port: _port, host: _host, onError, ...service} = options;
    const app = createApp(service);
    try {
        await app.listen({port, host});
    } catch (error) {
        await app.close();
        onError?.(error);
        return undefined;
    }
    const address = app.server.address() as AddressInfo;
    // `listen` resolved, so the socket has an address: there is nothing to fall back to, and the
    // bound port is the operating system's answer for `0`.
    return {
        app,
        url: `http://${host}:${address.port}`,
        stop: async (): Promise<void> => {
            await app.close();
        },
    };
}
