import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        async function $subject$ObjectPredicate(params: {id: unknown}, _$meta: IMeta) {
            return await this.config?.context?.queryBuilder
                ?.from('$object')
                .where(params)
                .select()
                .first();
        },
);
