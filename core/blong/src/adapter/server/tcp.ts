import createReconnect from 'reconnect-core';
import bitSyntax from 'ut-bitsyntax';

import { Socket } from 'net';
import { adapter, ITypedError } from '../../../types.js';
import tls from '../../tls.js';

export interface IConfig {
    tls?: object,
    client?: {connect: (...params: unknown[]) => Socket},
    host?: string,
    port?: number,
    localPort?: number,
    listen?: boolean,
    connection?: object
    maxReceiveBuffer: number,
    format?: {
        size: number
        sizeAdjust: number
        prefix: string
        codec: {
            new(config: object)
            encode: (data: object[], $meta, context, log) => string | Buffer
            decode: (buff: string | Buffer, $meta, context, log) => object[]
        }
    }
}

export default adapter<IConfig>(api => {
    let conCount = 0;
    const streams = [];

    const onError = (type: string): (error: Error) => void => function(err: Error): void {
        if (this.log?.error) {
            const error = new Error(`TCP ${type}`) as ITypedError;
            error.cause = err;
            error.type = `portTCP.${type}`;
            this.log.error(error);
        }
    };
    function connect(stream: Socket): void {
        conCount += 1;
        if (conCount > 0x1FFFFFFFFFFFFF) {
            conCount = 1;
        }
        streams.push(stream);

        if (streams.length > this.config.maxConnections) {
            this.log?.warn?.(`Connection limit exceeded (max ${this.config.maxConnections}). Closing ${this.config.connectionDropPolicy} connection.`);
            switch (this.config.connectionDropPolicy) {
                case 'oldest':
                    streams.shift().destroy();
                    break;
                case 'newest':
                    streams.pop().destroy();
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
            conId: undefined,
            trace: 0,
            callbacks: {},
            created: new Date(),
            localAddress: stream.localAddress,
            localPort: stream.localPort,
            remoteAddress: stream.remoteAddress,
            remotePort: stream.remotePort
        };

        if (this.config.listen) {
            context.conId = this.conCount;
        }

        this.connect(stream, context);
    }

    let server;
    let reconnect;
    let codec;

    return {
        async init(...configs: object[]) {
            await super.init({
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
                    prefix: ''
                }
            }, ...configs);
        },
        async start() {
            const result = await super.start();
            if (this.config.format.codec) {
                const Codec = this.config.format.codec;
                codec = new Codec({...api.utError, ...this.config.format});
                this.encode = (...params) => codec.encode(...params);
                this.decode = (...params) => codec.decode(...params);
            } else codec = null;
            if (codec && (codec.frameReducer) && (codec.frameBuilder)) {
                this.pack = codec.frameBuilder;
                this.unpack = codec.frameReducer;
            } else if (this.config.format.size) {
                const {size, sizeAdjust, prefix} = this.config.format;
                this.pack = bitSyntax.builder(`${prefix}${prefix && ', '}size:${size}, data:size/binary`);
                if (sizeAdjust || this.config.maxReceiveBuffer) {
                    this.unpackSize = bitSyntax.matcher(`${prefix}${prefix && ', '}size:${size}, data/binary`);
                    this.unpack = bitSyntax.matcher('data:size/binary, rest/binary');
                } else {
                    this.unpack = bitSyntax.matcher(`${prefix}${prefix && ', '}size:${size}, data:size/binary, rest/binary`);
                }
            }

            if (this.config.listen) {
                server = this.config.tls
                    ? (await import('node:tls')).createServer(tls(this.config, false), connect.bind(this))
                    : (await import('node:net')).createServer(connect.bind(this));

                server
                    .on('error', onError('server').bind(this))
                    .listen(this.config.port);
            } else {
                const client: {connect: (...args: unknown[]) => unknown} = this.config.client || await (this.config.tls ? import('node:tls') : import('node:net'));
                reconnect = createReconnect((...args: unknown[]) => client.connect(...args))(connect.bind(this))
                    .on('error', onError('client').bind(this))
                    .connect({
                        rejectUnauthorized: false,
                        ...tls(this.config, false),
                        ...Object.fromEntries([
                            ['host', this.config.host],
                            ['port', this.config.port],
                            ['localPort', this.config.localPort]
                        ].filter(([, value]) => value != null))
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
                    e?._connection?.unref();
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
        }
    };
});
