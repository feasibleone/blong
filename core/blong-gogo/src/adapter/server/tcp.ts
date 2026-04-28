import {adapter, type Adapter, type ITypedError} from '@feasibleone/blong/types';
import type {AdapterContext} from '@feasibleone/blong/types';
import {type Server, Socket} from 'net';
import createReconnect from 'reconnect-core';
import bitSyntax from 'ut-bitsyntax';

import tls from '../../tls.ts';

type CodecInstance = {
    encode: (...args: unknown[]) => unknown;
    decode: (...args: unknown[]) => unknown;
    frameReducer?: (...args: unknown[]) => unknown;
    frameBuilder?: (...args: unknown[]) => unknown;
};

export interface IConfig {
    tls?: object | null;
    client?: {connect: (...params: unknown[]) => Socket};
    host?: string;
    port?: number | null;
    localPort?: number | null;
    listen?: boolean;
    connection?: object;
    maxReceiveBuffer?: number;
    maxConnections?: number;
    connectionDropPolicy?: string;
    socketTimeOut?: number;
    format?: {
        size?: number | null;
        sizeAdjust?: number;
        prefix?: string;
        codec?: {
            new (config: object): CodecInstance;
            encode: (data: object[], $meta: unknown, context: unknown, log: unknown) => string | Buffer;
            decode: (buff: string | Buffer, $meta: unknown, context: unknown, log: unknown) => object[];
        } | null;
        id?: unknown;
    } | null;
}

export default adapter<IConfig>(api => {
    let conCount = 0;
    const streams: Socket[] = [];

    const onError = (type: string) =>
        function (this: Adapter<IConfig, AdapterContext>, err: Error): void {
            if (this.log?.error) {
                const error = new Error(`TCP ${type}`) as ITypedError;
                error.cause = err;
                error.type = `portTCP.${type}`;
                this.log.error(error);
            }
        };
    function connect(this: Adapter<IConfig, AdapterContext>, stream: Socket): void {
        conCount += 1;
        if (conCount > 0x1fffffffffffff) {
            conCount = 1;
        }
        streams.push(stream);

        const maxConnections = this.config.maxConnections ?? 1000;
        const connectionDropPolicy = this.config.connectionDropPolicy ?? 'oldest';
        if (streams.length > maxConnections) {
            this.log?.warn?.(
                `Connection limit exceeded (max ${maxConnections}). Closing ${connectionDropPolicy} connection.`,
            );
            switch (connectionDropPolicy) {
                case 'oldest':
                    streams.shift()!.destroy();
                    break;
                case 'newest':
                    streams.pop()!.destroy();
                    return;
            }
        }

        stream.on('close', () => {
            const index = streams.indexOf(stream);
            if (index !== -1) {
                streams.splice(index, 1);
            }
        });

        const context = {
            conId: undefined as number | undefined,
            trace: 0,
            callbacks: {},
            created: new Date(),
            localAddress: stream.localAddress,
            localPort: stream.localPort,
            remoteAddress: stream.remoteAddress,
            remotePort: stream.remotePort,
        };

        if (this.config.listen) {
            context.conId = conCount;
        }

        this.connect!(stream, context);
    }

    let server: Server | null = null;
    let reconnect: ReturnType<ReturnType<typeof createReconnect>> | null = null;
    let codec: CodecInstance | null = null;

    return {
        activation: {
            default: {
                logLevel: 'debug',
                type: 'tcp',
                host: '127.0.0.1',
                port: null,
                listen: false,
                tls: null,
                localPort: null,
                socketTimeOut: 60000 * 10,
                maxConnections: 1000,
                connectionDropPolicy: 'oldest',
                format: {
                    size: null,
                    codec: null,
                    id: null,
                    sizeAdjust: 0,
                    prefix: '',
                },
            },
        },
        async start(this: Adapter<IConfig, AdapterContext>) {
            const result = await super.start();
            const format = this.config.format;
            if (format?.codec) {
                const Codec = format.codec;
                codec = new Codec({...(api.utError as object), ...format});
                this.encode = (...params) => codec!.encode(...params) as Promise<string | Buffer>;
                this.decode = (...params) => codec!.decode(...params) as Promise<object[]>;
            } else codec = null;
            if (codec && (codec as {frameReducer?: unknown}).frameReducer && (codec as {frameBuilder?: unknown}).frameBuilder) {
                this.pack = (codec as {frameBuilder: unknown}).frameBuilder as Adapter<IConfig, AdapterContext>['pack'];
                this.unpack = (codec as {frameReducer: unknown}).frameReducer as Adapter<IConfig, AdapterContext>['unpack'];
            } else if (format?.size) {
                const {size, sizeAdjust = 0, prefix = ''} = format;
                this.pack = bitSyntax.builder(
                    `${prefix}${prefix && ', '}size:${size}, data:size/binary`,
                ) as Adapter<IConfig, AdapterContext>['pack'];
                if (sizeAdjust || this.config.maxReceiveBuffer) {
                    this.unpackSize = bitSyntax.matcher(
                        `${prefix}${prefix && ', '}size:${size}, data/binary`,
                    ) as Adapter<IConfig, AdapterContext>['unpackSize'];
                    this.unpack = bitSyntax.matcher('data:size/binary, rest/binary') as Adapter<IConfig, AdapterContext>['unpack'];
                } else {
                    this.unpack = bitSyntax.matcher(
                        `${prefix}${prefix && ', '}size:${size}, data:size/binary, rest/binary`,
                    ) as Adapter<IConfig, AdapterContext>['unpack'];
                }
            }

            if (this.config.listen) {
                server = this.config.tls
                    ? (await import('node:tls')).createServer(
                          tls(this.config as Parameters<typeof tls>[0], false) as Parameters<(typeof import('node:tls'))['createServer']>[0],
                          connect.bind(this),
                      )
                    : (await import('node:net')).createServer(connect.bind(this));

                server.on('error', onError('server').bind(this)).listen(this.config.port ?? undefined);
            } else {
                const client = (this.config.client ||
                    (await (this.config.tls ? import('node:tls') : import('node:net')))) as {connect: (...args: unknown[]) => unknown};
                reconnect = createReconnect((...args: unknown[]) => client.connect(...args))(
                    connect.bind(this) as (...args: unknown[]) => void,
                )
                    .on('error', onError('client').bind(this) as (...args: unknown[]) => void)
                    .connect({
                        rejectUnauthorized: false,
                        ...tls(this.config as Parameters<typeof tls>[0], false),
                        ...Object.fromEntries(
                            [
                                ['host', this.config.host],
                                ['port', this.config.port],
                                ['localPort', this.config.localPort],
                            ].filter(([, value]) => value != null),
                        ),
                    });
            }

            return result;
        },
        async stop(...params: unknown[]) {
            let result;
            try {
                if (reconnect) {
                    reconnect.removeAllListeners();
                    const e = reconnect.disconnect();
                    (e as {_connection?: {unref(): void}})?._connection?.unref();
                    reconnect = null;
                }
                if (server) {
                    server.close();
                    server.unref();
                    server = null;
                }
            } finally {
                result = await super.stop(...params);
            }
            return result;
        },
    };
});
