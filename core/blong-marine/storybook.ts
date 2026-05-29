/**
 * Storybook story fixtures for the marine biology demo.
 *
 * Exported constants are consumed by blong-browser’s Storybook stories.
 *
 * Single source of truth for each concern:
 *   - Coral type option labels  →  `coralTypeOptions` in `data/index.ts`
 *   - Coral names list          →  `marineCoralNames`  in `data/index.ts`
 *   - Coral editor schema/cards →  `coralEditorFixture` (this file)
 *   - Sample coral value        →  `coralStoryValue`   (this file, augmented with demo-only links)
 *   - Dropdown lookup table     →  `marineDropdownData` (this file, uses coralTypeOptions)
 *   - Synthetic explorer rows   →  `coralFixtures`     (this file, uses marineCoralNames)
 */
import type {ICardConfig, IEnrichedSchema} from '@feasibleone/blong';
import {coralTypeOptions, marineCoralNames} from './data/index.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ICoralEditorFixture {
    schema: IEnrichedSchema;
    cards: Record<string, ICardConfig>;
}

// ── Coral editor schema + cards ───────────────────────────────────────────────
//
// Mirrors the shape previously held by blong-browser's `fixtures/tree.ts`.
// Card IDs intentionally match the old tree card IDs (`edit`, `denied`,
// `reproduction`, `taxonomy`, `morphology`, `habitat`, `system`, `links`)
// so that Editor story layout configs need no changes.

const coralEditorFixture: ICoralEditorFixture = {
    schema: {
        properties: {
            coralId: {},
            coralName: {
                title: 'Name',
                required: true,
            },
            coralDescription: {
                title: 'Description',
                widget: {
                    type: 'text',
                },
            },
            coralType: {
                title: 'Type',
                widget: {
                    type: 'dropdown',
                    dropdown: 'marine.coralType',
                },
            },
            // ── Biology (replaces Reproduction) ───────────────────────────────
            polypDescription: {
                title: 'Polyp',
            },
            growthForm: {
                title: 'Growth Form',
            },
            spawnSeason: {
                title: 'Spawn Season',
            },
            symbioticAlgae: {
                title: 'Symbiotic Algae',
            },
            larvaType: {
                title: 'Larva Type',
            },
            // ── Taxonomy (read-only, server-populated) ─────────────────────────
            familyName: {
                title: 'Family',
                readOnly: true,
            },
            order: {
                title: 'Order',
                readOnly: true,
            },
            class: {
                title: 'Class',
                readOnly: true,
            },
            // ── Morphology ─────────────────────────────────────────────────────
            colorPattern: {
                title: 'Color Pattern',
            },
            maxDepth: {
                title: 'Max Depth (m)',
                type: 'number',
            },
            // ── Habitat zones (multiSelectPanel) ───────────────────────────────
            habitat: {
                title: '',
                widget: {
                    type: 'multiSelectPanel',
                    dropdown: 'marine.zone',
                },
            },
            // ── System ─────────────────────────────────────────────────────────
            discovered: {
                type: 'string',
                format: 'date',
                readOnly: true,
                title: 'Discovered',
            },
            // ── Links table ────────────────────────────────────────────────────
            links: {
                title: '',
                widget: {
                    type: 'table',
                    label: 'Links',
                    columns: ['title', 'url'],
                },
                items: {
                    properties: {
                        title: {filter: true},
                        url: {filter: true, sort: true},
                    },
                },
            },
        },
    },
    cards: {
        edit: {
            label: 'Coral',
            widgets: ['coralName', 'coralDescription', 'coralType'],
        },
        denied: {
            label: 'Permission Denied',
            permission: 'denied',
            widgets: [],
        },
        /** Biology — replaces Reproduction; covers polyp, growth, and spawning. */
        reproduction: {
            label: 'Biology',
            widgets: ['polypDescription', 'growthForm', 'spawnSeason'],
        },
        taxonomy: {
            label: 'Taxonomy',
            widgets: ['familyName', 'order', 'class'],
        },
        morphology: {
            label: 'Morphology',
            widgets: ['colorPattern', 'maxDepth', 'symbioticAlgae', 'larvaType'],
        },
        habitat: {
            label: 'Habitat',
            widgets: ['habitat'],
        },
        system: {
            label: 'System',
            widgets: ['discovered'],
        },
        links: {
            label: undefined,
            widgets: ['links'],
        },
    },
};

export default coralEditorFixture;

// ── Sample coral value ─────────────────────────────────────────────────────────
//
// Used as the pre-loaded value in Editor stories (equivalent of the Oak example
// in the old tree fixture). Staghorn Coral is the first entry in the YAML data.

export const coralStoryValue = {
    coralName: 'Staghorn Coral',
    coralId: 1,
    coralType: 'hard',
    familyName: 'Acroporidae',
    order: 'Scleractinia',
    class: 'Anthozoa',
    colorPattern: 'Brown with white tips',
    discovered: new Date('1758-01-01'),
    links: [
        {title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Acropora_cervicornis'},
        {title: 'GBIF', url: 'https://www.gbif.org/species/2260555'},
    ],
};

// ── Marine dropdown data ───────────────────────────────────────────────────────
//
// Keyed by the dropdown name used in widget schemas.  Replaces `treeDropdownData`
// from the old dispatch.tsx.

export const marineDropdownData: Record<string, {value: number | string; label: string}[]> = {
    /** Coral types — values come from `coralTypeOptions` in data/index.ts. */
    'marine.coralType': coralTypeOptions,
    'marine.zone': [
        {value: 1, label: 'Shallow Reef'},
        {value: 2, label: 'Deep Reef'},
        {value: 3, label: 'Lagoon'},
        {value: 4, label: 'Mangrove'},
        {value: 5, label: 'Seagrass Bed'},
        {value: 6, label: 'Sandy Bottom'},
        {value: 7, label: 'Rocky Substrate'},
    ],
};

// ── Explorer fixtures ──────────────────────────────────────────────────────────
//
// Synthetic data used by the Explorer / Navigator stories.  The 55-row set
// supports server-side filter, sort, and pagination demos.
//
// Names come from `marineCoralNames` in data/index.ts (mirrors marine.coral in marineYaml).

const coralTypesList = ['Hard', 'Soft', 'Black', 'Fire'];
const coralBaseDate = new Date(2022, 5, 22);

export const coralCategoryFixtures = [
    {id: 1, parentId: null as number | null, name: 'Reef Corals'},
    {id: 2, parentId: 1, name: 'Shallow Reef'},
    {id: 3, parentId: 1, name: 'Deep Reef'},
    {id: 4, parentId: null as number | null, name: 'Soft Corals'},
];

export const coralFixtures = [...Array(55).keys()].map(i => ({
    coralId: i,
    categoryId: (i % 4) + 1,
    coralName: marineCoralNames[i % marineCoralNames.length],
    coralType: coralTypesList[i % coralTypesList.length],
    maxDepth: (i + 1) * 5,
    endangered: i % 3 === 0,
    discoveredOn: new Date(coralBaseDate.getTime() + 1000 * 60 * 60 * 24 * i),
    lastUpdated: new Date(coralBaseDate.getTime() + 1000 * 60 * 60 * i),
}));
