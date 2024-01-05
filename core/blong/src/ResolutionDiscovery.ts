import hrtime from 'browser-process-hrtime';
import {hostname} from 'os';
import multicastResolver from 'ut-bus/resolver.js';
import discovery from 'ut-dns-discovery';

import {Errors, Internal} from '../types.js';
import type {IResolution} from './Resolution.js';
import type {IErrorFactory, IErrorMap} from './error.js';

const errorMap: IErrorMap = {
    'mdns.notFound': "Multicast DNS: '{namespace}' service not found.",
};

interface IConfig {
    domain: boolean;
    prefix: string;
    suffix: string;
    channel: string;
    tls: string;
}
export default class ResolutionDiscovery extends Internal implements IResolution {
    #announce: ReturnType<discovery>;
    #services: Set<string> = new Set();
    #errors: Errors<typeof errorMap>;
    #config: IConfig = {
        domain: true,
        prefix: '',
        suffix: '',
        tls: undefined,
        channel: undefined,
    };

    public resolve: IResolution['resolve'];

    public constructor(config: IConfig, {error}: {error: IErrorFactory}) {
        super();
        this.merge(this.#config, config);
        this.#announce = discovery();
        this.#errors = error.register(errorMap);
        const cache = {};
        this.resolve = async (service, invalidate, namespace) => {
            try {
                const now = hrtime();
                const hostName = `${this._serviceId(service)}.dns-discovery.local`;
                if (invalidate) {
                    delete cache[hostName];
                } else {
                    const cached = cache[hostName];
                    if (cached) {
                        if (hrtime(cached[0])[0] < 3) {
                            cached[0] = now;
                            return {...cached[1], cache: service, namespace};
                        } else {
                            delete cache[hostName];
                        }
                    }
                }
                const resolved = await multicastResolver(hostName, 'SRV', !!this.#config.tls);
                const result = {
                    hostname: resolved.target === '0.0.0.0' ? 'localhost' : resolved.target,
                    port: resolved.port,
                };
                if (cache) cache[hostName] = [now, result];
                return result;
            } catch (e) {
                const err = this.#errors['mdns.notFound']({params: {namespace}});
                err.cause = e;
                throw err;
            }
        };
    }

    private _serviceId(service: string): string {
        const tld = this.#config.tls ? '.' + this.#config.channel : ''; // similar to top level domain
        const prefix = this.#config.prefix;
        const suffix = this.#config.suffix || '-service' + tld;
        const domain = this.#config.domain === true ? hostname() + tld : this.#config.domain;
        return `${prefix}${service}${suffix}-${domain}`;
    }

    public announce(service: string, port: number): void {
        this.#services.add(`${this._serviceId(service)}:${port}`);
    }

    public async start(): Promise<void> {
        await Promise.all(
            Array.from(this.#services.values()).map(
                serviceId =>
                    new Promise((resolve, reject) => {
                        const [service, port] = serviceId.split(':');
                        this.#announce.announce(service, port, error =>
                            error ? reject(error) : resolve(true)
                        );
                    })
            )
        );
    }

    public async stop(): Promise<void> {
        await Promise.all(
            Array.from(this.#services.values()).map(
                serviceId =>
                    new Promise((resolve, reject) => {
                        const [service, port] = serviceId.split(':');
                        this.#announce.unannounce(service, port, error =>
                            error ? reject(error) : this.#services.delete(service)
                        );
                    })
            )
        );
    }
}
