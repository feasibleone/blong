import hrtime from 'browser-process-hrtime';
import { hostname } from 'os';
import multicastResolver from 'ut-bus/resolver';
import discovery from 'ut-dns-discovery';

import { errors, internal } from '../types.js';
import { type ErrorFactory } from './ErrorFactory.js';
import type { Resolution } from './Resolution.js';

const errorMap = {
    'mdns.notFound': "Multicast DNS: '{namespace}' service not found."
};

export default class ResolutionDiscovery extends internal implements Resolution {
    #announce: ReturnType<discovery>;
    #services = new Set<string>();
    #errors: errors<typeof errorMap>;
    #config = {
        domain: true,
        prefix: '',
        suffix: '',
        tls: undefined,
        channel: undefined
    };

    resolve: Resolution['resolve'];

    constructor(config, {error}: {error: ErrorFactory}) {
        super();
        this.merge(this.#config, config);
        this.#announce = discovery();
        this.#errors = error.register(errorMap);
        const cache = {};
        this.resolve = async(service, invalidate, namespace) => {
            try {
                const now = hrtime();
                const hostName = `${this.serviceId(service)}.dns-discovery.local`;
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
                    hostname: (resolved.target === '0.0.0.0' ? 'localhost' : resolved.target),
                    port: resolved.port
                };
                cache[hostName] = [now, result];
                return result;
            } catch (e) {
                const err = this.#errors['mdns.notFound']({params: {namespace}});
                err.cause = e;
                throw err;
            }
        };
    }

    serviceId(service: string) {
        const tld = this.#config.tls ? '.' + this.#config.channel : ''; // similar to top level domain
        const prefix = this.#config.prefix;
        const suffix = this.#config.suffix || '-service' + tld;
        const domain = (this.#config.domain === true) ? hostname() + tld : this.#config.domain;
        return `${prefix}${service}${suffix}-${domain}`;
    }

    announce(service: string, port: number) {
        this.#services.add(`${this.serviceId(service)}:${port}`);
    }

    async start() {
        await Promise.all(Array.from(this.#services.values()).map(serviceId => new Promise((resolve, reject) => {
            const [service, port] = serviceId.split(':');
            this.#announce.announce(
                service,
                port,
                error => error ? reject(error) : resolve(true)
            );
        })));
    }

    async stop() {
        await Promise.all(Array.from(this.#services.values()).map(serviceId => new Promise((resolve, reject) => {
            const [service, port] = serviceId.split(':');
            this.#announce.unannounce(
                service,
                port,
                error => error ? reject(error) : this.#services.delete(service)
            );
        })));
    }
}
