import {handler} from '@feasibleone/blong';

export default handler(() => ({
    config: {
        schema: {
            tables: {
                'marine.coral': 1,
                'marine.family': 1,
                'marine.species': 1,
                'marine.habitat': 1,
            },
        },
        mock: {
            marineFamilyModel: true,
            marineSpeciesModel: true,
            marineHabitatModel: true,
        },
    },
}));
