import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.federation.edit` — writes the organisation half and the federation half. */
export default handler(({handler: {partyOrganizationEdit}, lib: {profileUpdate}}) => ({
    async sportFederationEdit(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileUpdate(
            qb,
            'federation',
            params,
            partyOrganizationEdit as never,
            $meta as never,
        );
    },
}));
