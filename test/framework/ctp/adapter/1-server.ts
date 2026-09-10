import {adapter} from '@feasibleone/blong';
import {dirname, join} from 'node:path';

export default adapter(() => ({
    extends: 'adapter.tcp',
    activation: {
        default: {
            port: 1500,
            listen: true,
            tls: {
                cert: join(dirname(import.meta.url.slice(7)), '../tls.crt'),
                key: join(dirname(import.meta.url.slice(7)), '../tls.txt'),
            },
        },
    },
}));
