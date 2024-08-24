import {IMeta, handler} from '@feasibleone/blong';

export default handler(
    proxy =>
        async function $subject$ObjectPredicate(params: {id: unknown}, $meta: IMeta) {
            return await this.config.context.queryBuilder
                .from('$object')
                .where(params)
                .select()
                .first();
        }
);
