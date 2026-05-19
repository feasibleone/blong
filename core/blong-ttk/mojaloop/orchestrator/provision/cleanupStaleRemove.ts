import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Remove stale test entities based on retention period.
 *
 * This handler lists participants and removes those created before the retention
 * cutoff time. Useful for cleaning up after long-running test suites without
 * immediately deleting entities (allowing post-test debugging).
 *
 * NOTE: This is a placeholder implementation. The actual Admin API may not support
 * deletion or may require different approaches for cleanup.
 *
 * @param retentionHours - How many hours to keep test entities (defaults to 24)
 * @param dryRun - If true, only lists entities without deleting
 * @returns List of entities that were (or would be) cleaned up
 */
export default handler(({handler: {adminParticipantList}}) => ({
    async cleanupStaleRemove(
        {
            retentionHours = 24,
            dryRun = true,
        }: {
            retentionHours?: number;
            dryRun?: boolean;
        } = {},
        $meta: IMeta,
    ) {
        // Calculate cutoff time
        const cutoffTime = Date.now() - retentionHours * 60 * 60 * 1000;

        // List all participants
        const participants = await adminParticipantList({}, $meta);

        // Filter to test participants (prefix: test-dfsp-) created before cutoff
        const staleParticipants = (participants as any[]).filter((p: any) => {
            if (!p.name.startsWith('test-dfsp-')) return false;
            const createdTime = new Date(p.createdDate).getTime();
            return createdTime < cutoffTime;
        });

        if (dryRun) {
            return {
                dryRun: true,
                found: staleParticipants.length,
                participants: staleParticipants.map((p: any) => ({
                    name: p.name,
                    createdDate: p.createdDate,
                })),
            };
        }

        // TODO: Implement actual deletion if Admin API supports it
        // For now, just return what would be deleted
        return {
            dryRun: false,
            deleted: 0,
            message: 'Deletion not implemented - Admin API may not support participant deletion',
            found: staleParticipants.length,
        };
    },
}));
