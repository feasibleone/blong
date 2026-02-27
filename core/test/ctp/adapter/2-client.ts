import {dirname, join} from 'node:path';
import { adapter } from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.tcp',
    config: {
        default: {
            port: 1500,
            host: 'localhost',
            tls: {
                ca: join(dirname(import.meta.url.slice(7)), '../ca.crt'),
            },
        },
    },
}));
