/**
 * Marine biology domain schemas.
 * Used throughout the ui-demo Storybook stories.
 */
import type {IEnrichedSchema} from '@feasibleone/blong-browser';

/** Coral entity schema */
export const coralSchema: IEnrichedSchema = {
    title: 'Coral',
    properties: {
        coralId: {title: 'Coral ID', type: 'string', readOnly: true},
        coralName: {title: 'Common Name', type: 'string', required: true, widget: {type: 'input'}},
        scientificName: {title: 'Scientific Name', type: 'string', widget: {type: 'input'}},
        coralType: {
            title: 'Coral Type',
            type: 'string',
            widget: {
                type: 'dropdown',
                options: [
                    {value: 'hard', label: 'Hard Coral (Scleractinia)'},
                    {value: 'soft', label: 'Soft Coral (Alcyonacea)'},
                    {value: 'black', label: 'Black Coral (Antipatharia)'},
                    {value: 'fire', label: 'Fire Coral (Millepora)'},
                ],
            },
        },
        maxDepth: {
            title: 'Max Depth (m)',
            type: 'integer',
            minimum: 0,
            maximum: 6000,
            widget: {type: 'integer'},
        },
        colorPalette: {title: 'Color Palette', type: 'string', widget: {type: 'textArea'}},
        endangered: {title: 'Endangered', type: 'boolean', widget: {type: 'boolean'}},
        iucnStatus: {
            title: 'IUCN Status',
            type: 'string',
            widget: {
                type: 'dropdown',
                options: [
                    {value: 'LC', label: 'Least Concern'},
                    {value: 'NT', label: 'Near Threatened'},
                    {value: 'VU', label: 'Vulnerable'},
                    {value: 'EN', label: 'Endangered'},
                    {value: 'CR', label: 'Critically Endangered'},
                ],
            },
        },
        description: {title: 'Description', type: 'string', widget: {type: 'textArea'}},
        discoveredYear: {
            title: 'Year Discovered',
            type: 'integer',
            minimum: 1700,
            widget: {type: 'integer'},
        },
    },
    required: ['coralName', 'coralType'],
};

/** Habitat entity schema */
export const habitatSchema: IEnrichedSchema = {
    title: 'Habitat',
    properties: {
        habitatId: {title: 'Habitat ID', type: 'string', readOnly: true},
        habitatName: {
            title: 'Habitat Name',
            type: 'string',
            required: true,
            widget: {type: 'input'},
        },
        habitatType: {
            title: 'Habitat Type',
            type: 'string',
            widget: {
                type: 'select',
                options: [
                    {value: 'reef', label: 'Coral Reef'},
                    {value: 'atoll', label: 'Atoll'},
                    {value: 'lagoon', label: 'Lagoon'},
                    {value: 'seagrass', label: 'Seagrass Bed'},
                    {value: 'open_ocean', label: 'Open Ocean'},
                ],
            },
        },
        oceanZone: {
            title: 'Ocean Zone',
            type: 'string',
            widget: {
                type: 'dropdown',
                options: [
                    {value: 'sunlight', label: 'Sunlight Zone (0–200m)'},
                    {value: 'twilight', label: 'Twilight Zone (200–1000m)'},
                    {value: 'midnight', label: 'Midnight Zone (1000–4000m)'},
                    {value: 'abyssal', label: 'Abyssal Zone (4000–6000m)'},
                ],
            },
        },
        latitude: {
            title: 'Latitude',
            type: 'number',
            minimum: -90,
            maximum: 90,
            widget: {type: 'number'},
        },
        longitude: {
            title: 'Longitude',
            type: 'number',
            minimum: -180,
            maximum: 180,
            widget: {type: 'number'},
        },
        waterTemperatureMin: {
            title: 'Min Temperature (°C)',
            type: 'number',
            widget: {type: 'number'},
        },
        waterTemperatureMax: {
            title: 'Max Temperature (°C)',
            type: 'number',
            widget: {type: 'number'},
        },
        salinity: {
            title: 'Salinity (ppt)',
            type: 'number',
            minimum: 0,
            maximum: 50,
            widget: {type: 'number'},
        },
        protectionStatus: {title: 'Protected Area', type: 'boolean', widget: {type: 'boolean'}},
        notes: {title: 'Notes', type: 'string', widget: {type: 'textArea'}},
    },
    required: ['habitatName', 'habitatType'],
};

/** Species entity schema */
export const speciesSchema: IEnrichedSchema = {
    title: 'Species',
    properties: {
        speciesId: {title: 'Species ID', type: 'string', readOnly: true},
        speciesName: {
            title: 'Common Name',
            type: 'string',
            required: true,
            widget: {type: 'input'},
        },
        genus: {title: 'Genus', type: 'string', required: true, widget: {type: 'input'}},
        species: {
            title: 'Species Epithet',
            type: 'string',
            required: true,
            widget: {type: 'input'},
        },
        familyId: {
            title: 'Family',
            type: 'string',
            widget: {type: 'dropdown', fetch: 'marine.family.find'},
        },
        habitatIds: {
            title: 'Habitats',
            type: 'array',
            widget: {type: 'multiSelect', fetch: 'marine.habitat.find'},
        },
        bodyLength: {
            title: 'Body Length (cm)',
            type: 'number',
            minimum: 0,
            widget: {type: 'number'},
        },
        lifespan: {
            title: 'Lifespan (years)',
            type: 'integer',
            minimum: 0,
            widget: {type: 'integer'},
        },
        diet: {
            title: 'Diet',
            type: 'string',
            widget: {
                type: 'select',
                options: [
                    {value: 'carnivore', label: 'Carnivore'},
                    {value: 'herbivore', label: 'Herbivore'},
                    {value: 'omnivore', label: 'Omnivore'},
                    {value: 'filter_feeder', label: 'Filter Feeder'},
                    {value: 'detritivore', label: 'Detritivore'},
                ],
            },
        },
        endangered: {title: 'Endangered', type: 'boolean', widget: {type: 'boolean'}},
        notes: {title: 'Notes', type: 'string', widget: {type: 'textArea'}},
    },
    required: ['speciesName', 'genus', 'species'],
};

/** Family entity schema */
export const familySchema: IEnrichedSchema = {
    title: 'Family',
    properties: {
        familyId: {title: 'Family ID', type: 'string', readOnly: true},
        familyName: {title: 'Family Name', type: 'string', required: true, widget: {type: 'input'}},
        order: {title: 'Order', type: 'string', widget: {type: 'input'}},
        class_: {title: 'Class', type: 'string', widget: {type: 'input'}},
        description: {title: 'Description', type: 'string', widget: {type: 'textArea'}},
        speciesCount: {
            title: 'Known Species',
            type: 'integer',
            readOnly: true,
            widget: {type: 'integer'},
        },
    },
    required: ['familyName'],
};
