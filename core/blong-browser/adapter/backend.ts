import {adapter} from '@feasibleone/blong';

export default adapter(() => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: 'backend',
            imports: ['codec.jsonrpc', 'codec.mle'],
            url: globalThis.window?.location?.origin ?? 'http://localhost:8080',
        },
    },
}));
