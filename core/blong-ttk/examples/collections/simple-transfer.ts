/**
 * Example test collection - Simple transfer flow
 *
 * This demonstrates the blong-ttk testing pattern without external dependencies.
 */

import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}}) => ({
    /**
     * Example test collection showing basic patterns
     */
    exampleSimpleTransfer: ({name = 'Simple Transfer Example'}: {name?: string}, $meta: IMeta) =>
        group(name)([
            async function prepareTestData(assert: typeof Assert, {$meta}: any) {
                // In a real test, this would call provisioning handlers
                // For this example, we just create mock data
                const transferId = 'test-transfer-' + Date.now();
                const amount = {amount: '100', currency: 'USD'};

                return {transferId, amount};
            },

            async function initiateTransfer(assert: typeof Assert, {prepareTestData, $meta}: any) {
                const {transferId, amount} = (await prepareTestData) as Awaited<
                    ReturnType<typeof prepareTestData>
                >;

                // Simulate an API call
                const result = {
                    transferId,
                    status: 'PENDING',
                    ...amount,
                };

                assert.ok(result.transferId);
                assert.equal(result.status, 'PENDING');

                return result;
            },

            async function verifyTransferStatus(
                assert: typeof Assert,
                {initiateTransfer, $meta}: any,
            ) {
                const transfer = (await initiateTransfer) as any;

                // Simulate checking transfer status
                const status = {
                    transferId: transfer.transferId,
                    state: 'COMMITTED',
                    completedAt: Date.now(),
                };

                assert.equal(status.state, 'COMMITTED');
                assert.ok(status.completedAt > 0);

                return status;
            },
        ]),
}));
