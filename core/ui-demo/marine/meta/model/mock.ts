import {mock} from '@feasibleone/blong';

export default mock(() => ({
    subjects: {
        marineFamily: [],
        marineHabitat: [],
        marineSpecies: [],
    },
    dropdowns: {
        'marine.family': [
            {value: 1, label: 'Acroporidae'},
            {value: 2, label: 'Faviidae'},
            {value: 3, label: 'Pocilloporidae'},
            {value: 4, label: 'Poritidae'},
        ],
        'marine.habitat': [
            {value: 1, label: 'Great Barrier Reef'},
            {value: 2, label: 'Caribbean Reef System'},
            {value: 3, label: 'Red Sea'},
            {value: 4, label: 'Coral Triangle'},
        ],
        'marine.species': [
            {value: 1, label: 'Acropora palmata'},
            {value: 2, label: 'Porites lobata'},
            {value: 3, label: 'Orbicella faveolata'},
        ],
    },
}));
