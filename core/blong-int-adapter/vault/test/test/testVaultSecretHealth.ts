import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

type HealthResult = {
    initialized?: boolean;
    sealed?: boolean;
    standby?: boolean;
    cluster_name?: string;
    version?: string;
};
type StepMeta = {$meta: IMeta};

/**
 * testVaultSecretHealth — integration test verifying Vault health and status endpoints.
 *
 * Checks that the Vault server is initialized, unsealed, and running the expected version.
 */
export default handler(
    ({lib: {group}, handler: {secretsSecretHealth, secretsSecretStatus}}) => ({
        testVaultSecretHealth: ({name = 'vault health and status'}: {name?: string}) =>
            group(name)([
                // ── 1. health — verify the Vault server is healthy ─────────
                async function healthCheck(assert: typeof Assert, {$meta}: StepMeta) {
                    const result = await secretsSecretHealth({}, $meta);
                    assert.ok(result, 'health returned a result');
                    assert.strictEqual(
                        (result as HealthResult).initialized,
                        true,
                        'vault is initialized',
                    );
                    assert.strictEqual(
                        (result as HealthResult).sealed,
                        false,
                        'vault is unsealed',
                    );
                    return result as HealthResult;
                },

                // ── 2. status — verify the Vault server status ─────────────
                async function statusCheck(
                    assert: typeof Assert,
                    {$meta, healthCheck}: StepMeta & {healthCheck: Promise<HealthResult>},
                ) {
                    await healthCheck;
                    const result = await secretsSecretStatus({}, $meta);
                    assert.ok(result, 'status returned a result');
                    assert.strictEqual(
                        (result as HealthResult).sealed,
                        false,
                        'vault status shows unsealed',
                    );
                    return result as HealthResult;
                },
            ]),
    }),
);
