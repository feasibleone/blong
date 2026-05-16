import {adapter, type IMeta} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.tcp',
    activation: {
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
            $meta.dispatch = (msg: object = {}, dispatchMeta?: IMeta) => {
                if (!dispatchMeta) return;
                dispatchMeta.mtid = 'response';
                switch (dispatchMeta.method) {
                    case 'echo': {
                        return [
                            {data: (msg as {data?: unknown}).data, errorCode: '00'},
                            dispatchMeta,
                        ] as [object, IMeta];
                    }
                }
            };
        }
        return params;
    },
}));
