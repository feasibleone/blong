import {type IMeta, handler} from '@feasibleone/blong';

/**
 * `sport.conferral.edit` — re-derives `recipientKind` before the generic update,
 * so changing the recipient cannot leave the stored kind behind. @@D-598
 */
export default handler(({lib: {recipientKindOf}}) => ({
    async sportConferralEdit(
        params: {conferral?: Record<string, unknown>} & Record<string, unknown>,
        $meta: IMeta,
    ): Promise<unknown> {
        const conferral = {...(params.conferral ?? {})};
        const qb = this.config?.context?.queryBuilder;
        if (qb && conferral.recipientResourceId) {
            conferral.recipientKind = await recipientKindOf(qb, conferral.recipientResourceId);
        }
        return super.exec({...params, conferral}, $meta);
    },
}));
