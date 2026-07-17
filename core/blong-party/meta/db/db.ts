import {handler} from '@feasibleone/blong';

export default handler(() => ({
    config: {
        schema: {
            dbTest: true,
            tables: {
                'party.person': 300,
                'party.organization': 301,
                'party.unit': 302,
                'party.contact': 303,
                'party.address': 304,
                'party.identifier': 305,
            },
        },
        // No mock entries — all models use real DB tables (like marineCoralModel).
    },
}));
