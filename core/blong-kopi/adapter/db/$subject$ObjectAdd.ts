import {handler, type IMeta, type Knex} from '@feasibleone/blong';

/** Allowed `$object` status codes. */
const $objectStatuses = ['draft', 'sent', 'paid', 'void'];

type $ObjectInput = {
    $objectName: string;
    $objectStatus: string;
};

type $ObjectLineInput = {
    lineName: string;
    lineQuantity: number;
};

type $ObjectOutput = {
    $objectId: number;
    $objectName: string;
    $objectStatus: string;
    createdAt?: string;
};

type $ObjectLineOutput = {
    lineId: number;
    $objectId: number;
    lineName: string;
    lineQuantity: number;
};

/**
 * adapter/db/$subject$ObjectAdd.ts — `$subject.$object.add`.
 *
 * Creates a `$object` with its detail rows in one call. Validates the status,
 * inserts the header then each detail row, and returns the created records.
 *
 * DB persistence handlers live in `adapter/db/` and reach the shared knex pool via
 * `this.config?.context?.queryBuilder` — do NOT put them in `orchestrator/`.
 */
export default handler(
    ({errors: {error$SubjectInvalidStatus}}) =>
        async function $subject$ObjectAdd(
            params: {
                $object: $ObjectInput;
                details?: $ObjectLineInput[];
            },
            $meta: IMeta,
        ): Promise<{$object: $ObjectOutput; details: $ObjectLineOutput[]}> {
            const qb = this.config?.context?.queryBuilder as Knex | undefined;
            if (!qb) throw new Error('Database not available');

            const {$objectStatus} = params.$object;
            if (!$objectStatuses.includes($objectStatus)) {
                throw error$SubjectInvalidStatus({params: {$objectStatus}}, $meta);
            }

            const [$objectId] = await qb('$subject_$object').insert({
                $objectName: params.$object.$objectName,
                $objectStatus,
                createdAt: new Date(),
            });

            const details: $ObjectLineOutput[] = [];
            for (const line of params.details ?? []) {
                const [lineId] = await qb('$subject_line').insert({
                    $objectId,
                    lineName: line.lineName,
                    lineQuantity: line.lineQuantity,
                });
                details.push({lineId, $objectId, ...line});
            }

            const $object = (await qb('$subject_$object')
                .where({$objectId})
                .first()) as unknown as $ObjectOutput;

            return {$object, details};
        },
);
