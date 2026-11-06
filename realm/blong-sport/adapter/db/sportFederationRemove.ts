import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.federation.remove` — @@D-595 @@D-786 */
export default handler(({handler: {partyOrganizationRemove}, lib: {profileRemove}}) => ({
    async sportFederationRemove(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileRemove(
            qb,
            'federation',
            params,
            partyOrganizationRemove as never,
            $meta as never,
            (next: unknown, meta: unknown) => super.exec(next as never, meta as never),
        );
    },
}));
