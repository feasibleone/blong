import { readFileSync } from 'fs';

export default function tls(config: {tls?: {ca?: string | string[], key?: string, cert?: string, crl?: string}}, got: boolean): {
    minVersion: 'TLSv1.3'
    ca?: Buffer | Buffer[]
    key?: Buffer
    cert?: Buffer
    crl?: Buffer
} | {
    minVersion: 'TLSv1.3'
    certificateAuthority?: Buffer | Buffer[]
    key?: Buffer
    certificate?: Buffer
    certificateRevocationLists?: Buffer
} {
    if (config?.tls) {
        return {
            minVersion: 'TLSv1.3',
            ...config.tls,
            ...config.tls.ca && {[got ? 'certificateAuthority' : 'ca']: Array.isArray(config.tls.ca) ? config.tls.ca.map(file => readFileSync(file)) : readFileSync(config.tls.ca)},
            ...config.tls.key && {key: readFileSync(config.tls.key)},
            ...config.tls.cert && {[got ? 'certificate' : 'cert']: readFileSync(config.tls.cert)},
            ...config.tls.crl && {[got ? 'certificateRevocationLists' : 'crl']: readFileSync(config.tls.crl)}
        };
    }
}
