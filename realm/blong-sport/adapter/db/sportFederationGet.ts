import {handler} from '@feasibleone/blong';

/** `sport.federation.get` — one flat organisation + federation row. */
export default handler(({lib: {profileGet}}) => ({
    async sportFederationGet(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileGet(qb, 'federation', params);
    },
}));
