import {adapter} from '@feasibleone/blong';
import {dirname, join} from 'node:path';

export default adapter(() => ({
    extends: 'adapter.tcp',
    activation: {
        default: {
            port: 1500,
            host: 'localhost',
            tls: {
                ca: join(dirname(import.meta.url.slice(7)), '../ca.crt'),
            },
        },
    },
}));
