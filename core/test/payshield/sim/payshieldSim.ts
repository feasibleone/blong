import {IMeta} from '@feasibleone/blong';
import codec from 'ut-codec-payshield';
import tcpPort from 'ut-port-tcp';

import log from '../log.js';

export default (layer: unknown): unknown =>
    class extends tcpPort(layer) {
        public get defaults(): object {
            return {
                format: {
                    codec,
                    maskedKeys: Object.keys(log.transform),
                },
                log,
            };
        }

        public get handlers(): unknown {
            return {
                receive(params: unknown, $meta: IMeta): unknown {
                    if ($meta.mtid === 'request') {
                        $meta.dispatch = (params: {data: unknown}, dispatchMeta) => {
                            dispatchMeta.mtid = 'response';
                            switch (dispatchMeta.method) {
                                case 'echo':
                                    return [{data: params.data, errorCode: '00'}, dispatchMeta];
                                case 'generateKey':
                                    return [
                                        {
                                            key: '0'.repeat(33),
                                            errorCode: '00',
                                            rest: Buffer.from('000'),
                                        },
                                        dispatchMeta,
                                    ];
                            }
                        };
                    }
                    return params;
                },
            };
        }
    };
