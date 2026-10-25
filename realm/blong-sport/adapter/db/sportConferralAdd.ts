import {type IMeta, handler} from '@feasibleone/blong';

/**
 * `sport.conferral.add` — stamps `recipientKind` before the generic create.
 *
 * The form cannot know whether the recipient is an athlete, a coach, a
 * specialist, a club or a federation, so the kind is read from `core_resource`
 * and written over whatever the payload carried. The write itself is the generic
 * CRUD, reached with `super.exec` — the override replaces the method, and the
 * unchanged one is only available through the prototype. @@D-598
 */
export default handler(({lib: {recipientKindOf}}) => ({
    async sportConferralAdd(
        params: {conferral?: Record<string, unknown>} & Record<string, unknown>,
        $meta: IMeta,
    ): Promise<unknown> {
        const conferral = {...(params.conferral ?? {})};
        // The key is a `ulid` the adapter generates from the literal marker; a
        // payload that omits it inserts no id at all.
        if (!conferral.conferralId) conferral.conferralId = 'ulid';
        const qb = this.config?.context?.queryBuilder;
        if (qb && conferral.recipientResourceId) {
            conferral.recipientKind = await recipientKindOf(qb, conferral.recipientResourceId);
        }
        return super.exec({...params, conferral}, $meta);
    },
}));
