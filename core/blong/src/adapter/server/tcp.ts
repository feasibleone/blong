import { readFileSync } from 'fs';
import createReconnect from 'reconnect-core';
import { Stream } from 'stream';
import bitSyntax from 'ut-bitsyntax';

import { adapter, TypedError } from '../../../types.js';
import tls from '../../tls.js';

export type config = {
    tls?: {
        keyPath: string
        certPath: string
        caPaths: string[]
    },
    client?: {connect: (...params: unknown[]) => Stream},
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

export default adapter<config>(api => {
    let conCount = 0;
    const streams = [];

    const onError = type => function(err) {
        if (this.log?.error) {
            const error = new Error(`TCP ${type}`) as TypedError;
            error.cause = err;
            error.type = `portTCP.${type}`;
            this.log.error(error);
        }
    };
    function connect(stream) {
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
        async init(...configs) {
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
                    ? (await import('node:tls')).createServer(tls(this.config.tls, false), connect.bind(this))
                    : (await import('node:net')).createServer(connect.bind(this));

                server
                    .on('error', onError('server').bind(this))
                    .listen(this.config.port);
            } else {
                let connProp;
                if (this.config.tls) {
                    connProp = {
                        host: this.config.host,
                        port: this.config.port,
                        rejectUnauthorized: false,
                        ...this.config.connection
                    };
                    if (this.config.tls.keyPath) {
                        connProp.key = readFileSync(this.config.tls.keyPath, 'utf8');
                    }
                    if (this.config.tls.certPath) {
                        connProp.cert = readFileSync(this.config.tls.certPath, 'utf8');
                    }
                    if (Array.isArray(this.config.tls.caPaths)) {
                        connProp.ca = this.config.tls.caPaths.map(file => readFileSync(file, 'utf8'));
                    }
                } else {
                    connProp = {
                        host: this.config.host,
                        port: this.config.port,
                        ...this.config.connection
                    };
                }
                if (this.config.localPort) {
                    connProp.localPort = this.config.localPort;
                }
                const client = this.config.client || await (this.config.tls ? import('node:tls') : import('node:net'));
                reconnect = createReconnect((...args) => client.connect(...args))(connect.bind(this))
                    .on('error', onError('client').bind(this))
                    .connect({
                        ...tls(this.config, false),
                        ...Object.fromEntries([
                            ['host', this.config.host],
                            ['port', this.config.port],
                            ['localPort', this.config.localPort]
                        ].filter(([_, value]) => value != null))
                    });
            }

            return result;
        },
        async stop(...params) {
            let result;
            try {
                if (reconnect) {
                    reconnect.removeAllListeners();
                    const e = reconnect.disconnect();
                    e && e._connection && e._connection.unref();
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
