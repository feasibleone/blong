import {adapter} from '@feasibleone/blong';

export default adapter(blong => ({
    extends: 'adapter.http',
    activation: {
        default: {
            namespace: 'backend',
            imports: ['codec.jsonrpc', 'codec.mle'],
            url: 'http://localhost:8080',
        },
    },
}));
