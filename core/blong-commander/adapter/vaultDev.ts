import {adapter} from '@feasibleone/blong';

/**
 * `vault-dev` adapter instance — Vault explorer source for the commander dev
 * suite. Namespace `vault-dev` so `vault-dev.mount.list` /
 * `vault-dev.secret.list` reach this instance.
 */
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
            namespace: 'vault-dev',
            imports: [],
        },
    },
}));
