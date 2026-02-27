import { adapter } from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.tcp',
    config: {
        default: {
            namespace: 'payshield',
            host: 'localhost',
            port: 1600,
            idleSend: 10000,
            maxReceiveBuffer: 4096,
            format: {
                size: '16/integer',
            },
            imports: 'ctp.payshield',
            'ctp.payshield': {
                headerFormat: '6/string-left-zero',
            },
            listen: false,
        },
        dev: {
            // host: 'hsm.softwaregroup-bg.com',
            // port: 1500
        },
    },
}));
