import {adapter, type IMeta} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.tcp',
    config: {
        default: {
            port: 1600,
            maxReceiveBuffer: 4096,
            format: {
                size: '16/integer',
            },
            imports: 'ctp.payshield',
            'ctp.payshield': {
                headerFormat: '6/string-left-zero',
            },
            listen: true,
        },
    },
    receive(params: unknown, $meta: IMeta) {
        if ($meta.mtid === 'request') {
            $meta.dispatch = (params: {data: unknown}, dispatchMeta) => {
                dispatchMeta.mtid = 'response';
                switch (dispatchMeta.method) {
                    case 'echo': {
                        return [{data: params.data, errorCode: '00'}, dispatchMeta];
                    }
                }
            };
        }
        return params;
    },
}));
