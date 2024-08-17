import {adapter, IMeta} from '@feasibleone/blong';

export default adapter<object>(api => ({
    extends: 'adapter.tcp',
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
