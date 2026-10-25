import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.federation.add` — the organisation is created by party, the federation row under it. */
export default handler(({handler: {partyOrganizationAdd}, lib: {profileCreate}}) => ({
    async sportFederationAdd(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileCreate(
            qb,
            'federation',
            params,
            partyOrganizationAdd as never,
            $meta as never,
        );
    },
}));
