import {dirname, join} from 'node:path';
import { adapter } from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.tcp',
    config: {
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
