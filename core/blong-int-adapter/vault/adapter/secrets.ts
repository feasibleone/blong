import {adapter} from '@feasibleone/blong';

export default adapter<{
    vault: {
        endpoint?: string;
        token?: string;
        apiVersion?: string;
    };
}>(() => ({
    extends: 'adapter.vault',
    activation: {
        default: {
            vault: {
                endpoint: 'http://localhost:8200',
                token: 'root',
                apiVersion: 'v1',
            },
            namespace: 'secrets',
            imports: [],
        },
    },
}));
