import {adapter} from '@feasibleone/blong';

export default adapter<{
    vault: {
        endpoint?: string;
        token?: string;
        apiVersion?: string;
    };
}>(api => ({
    extends: 'adapter.vault',
    activation: {
        default: {
            vault: {
                endpoint: 'http://localhost:30200',
                token: 'root',
                apiVersion: 'v1',
            },
            namespace: 'secrets',
            imports: [],
        },
    },
}));
