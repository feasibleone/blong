import { readFileSync } from 'fs';

export default function tls(config, got) {
    if (config?.tls) {
        return {
            minVersion: 'TLSv1.3',
            ...config.tls,
            ...config.tls.ca && {[got ? 'certificateAuthority' : 'ca']: Array.isArray(config.tls.ca) ? config.tls.ca.map(file => readFileSync(file, 'utf8')) : readFileSync(config.tls.ca)},
            ...config.tls.key && {key: readFileSync(config.tls.key)},
            ...config.tls.cert && {[got ? 'certificate' : 'cert']: readFileSync(config.tls.cert)},
            ...config.tls.crl && {[got ? 'certificateRevocationLists' : 'crl']: readFileSync(config.tls.crl)}
        };
    }
}
