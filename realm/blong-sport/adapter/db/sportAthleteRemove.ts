import {type IMeta, handler} from '@feasibleone/blong';

/**
 * `sport.athlete.remove` — the profile row first, the person behind it only when
 * no other profile still holds the id. @@D-595
 *
 * Both steps are the generic remove: it cascades the rows that point at the record
 * (`cascade: true`), which is what keeps a delete from failing on a foreign key. The
 * second step is the one that removes the resource row behind the person. @@D-786
 */
export default handler(({handler: {partyPersonRemove}, lib: {profileRemove}}) => ({
    async sportAthleteRemove(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileRemove(
            qb,
            'athlete',
            params,
            partyPersonRemove as never,
            $meta as never,
            (next: unknown, meta: unknown) => super.exec(next as never, meta as never),
        );
    },
}));
