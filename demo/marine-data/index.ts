/**
 * Marine biology fixture data — single source of truth.
 *
 * All fixture data is maintained here in YAML format. The YAML string is
 * exported so any consumer (fixture handlers, tests, stories) can import
 * and parse it with `lib.yaml.parse(marineYaml)` or any YAML library.
 *
 * Entity hierarchy:
 *   Family (with coral-type parent categories for tree navigator)
 *     └── Coral  (belongs to a Family)
 *     └── Species (belongs to a Family)
 *   Habitat (ocean zones + specific reef systems)
 *
 * Shared option lists (used by model widgets AND storybook dropdown data):
 *   coralTypeOptions — the four coral-type values
 *   marineCoralNames — coral names from marine.coral entries
 */

/**
 * Coral type options — shared between model `select` widgets and storybook
 * `portalDropdownList` data.  Defined once here; imported by
 * `marineCoralModel.ts` (inline widget options) and `/storybook.ts`
 * (dropdown lookup table).
 */
export const coralTypeOptions = [
    {value: 'hard', label: 'Hard Coral'},
    {value: 'soft', label: 'Soft Coral'},
    {value: 'fire', label: 'Fire Coral'},
    {value: 'black', label: 'Black Coral'},
];

/**
 * Coral names extracted from `marine.coral[*].coralName` in `marineYaml`.
 * Used by `/storybook.ts` to generate synthetic explorer fixture rows
 * without duplicating the names inline.
 */
export const marineCoralNames = [
    'Brain Coral',
    'Staghorn Coral',
    'Sea Fan',
    'Black Wire Coral',
    'Pillar Coral',
    'Elkhorn Coral',
    'Fire Coral',
    'Star Coral',
    'Mushroom Coral',
    'Table Coral',
] as const;

/**
 * YAML string containing all marine biology fixture data.
 * Use `yaml.parse(marineYaml)` to obtain a typed object map.
 */
export const marineYaml = /* yaml */ `
marine.family:
  # ── Actual families first so the navigator auto-selects a real family ──────
  - familyId: 1
    familyName: Acroporidae
    parentFamilyId: 100
    order: Scleractinia
    class: Anthozoa
    familyDescription: The largest family of hard corals; includes staghorn and elkhorn species.
  - familyId: 2
    familyName: Faviidae
    parentFamilyId: 100
    order: Scleractinia
    class: Anthozoa
    familyDescription: Brain corals and star corals; typically massive dome-shaped growth.
  - familyId: 3
    familyName: Gorgoniidae
    parentFamilyId: 200
    order: Alcyonacea
    class: Anthozoa
    familyDescription: Sea fans and sea whips; fan-shaped colonies in purple, yellow, and red.
  - familyId: 4
    familyName: Antipathidae
    parentFamilyId: 400
    order: Antipatharia
    class: Anthozoa
    familyDescription: Black wire corals found in deep, cold water below 50 m.
  - familyId: 5
    familyName: Dendrophylliidae
    parentFamilyId: 100
    order: Scleractinia
    class: Anthozoa
    familyDescription: Cup corals; mostly azooxanthellate and found in deep or dark habitats.
  - familyId: 6
    familyName: Milleporidae
    parentFamilyId: 300
    order: Anthoathecata
    class: Hydrozoa
    familyDescription: Fire corals; form calcium carbonate skeletons but are hydrozoans.
  - familyId: 7
    familyName: Siderastreidae
    parentFamilyId: 100
    order: Scleractinia
    class: Anthozoa
    familyDescription: Star and dome corals; often found in turbid, shallow-water habitats.
  - familyId: 8
    familyName: Fungiidae
    parentFamilyId: 100
    order: Scleractinia
    class: Anthozoa
    familyDescription: Mushroom corals; solitary polyps living free on soft substrates.
  # ── Coral-type category nodes (no parent — tree roots in the navigator) ─────
  - familyId: 100
    familyName: Hard Corals
    order: Scleractinia
    class: Anthozoa
    familyDescription: Reef-building corals with calcium carbonate skeletons.
  - familyId: 200
    familyName: Soft Corals
    order: Alcyonacea
    class: Anthozoa
    familyDescription: Flexible corals without rigid skeletons; often tree- or feather-like.
  - familyId: 300
    familyName: Fire Corals
    order: Anthoathecata
    class: Hydrozoa
    familyDescription: Not true corals; stinging hydrozoans resembling branching coral.
  - familyId: 400
    familyName: Black Corals
    order: Antipatharia
    class: Anthozoa
    familyDescription: Deep-water corals with dark, wire-like skeletons.

marine.coral:
  - coralId: 1
    coralName: Staghorn Coral
    familyId: 1
    familyName: Acroporidae
    habitatId: 1
    habitatName: Great Barrier Reef
    coralType: hard
    maxDepth: 30
    colorPattern: Brown with white tips
    conservationStatus: CR
    isEndangered: true
    discoveryDate: '1758-01-01'
    coralDescription: Fast-growing branching coral that forms important reef habitat.
  - coralId: 2
    coralName: Brain Coral
    familyId: 2
    familyName: Faviidae
    habitatId: 3
    habitatName: Caribbean Reef System
    coralType: hard
    maxDepth: 40
    colorPattern: Green with ridges
    conservationStatus: LC
    isEndangered: false
    discoveryDate: '1801-01-01'
    coralDescription: Massive coral with grooved surface resembling a human brain.
  - coralId: 3
    coralName: Sea Fan
    familyId: 3
    familyName: Gorgoniidae
    habitatId: 3
    habitatName: Caribbean Reef System
    coralType: soft
    maxDepth: 15
    colorPattern: Purple with white tips
    conservationStatus: LC
    isEndangered: false
    discoveryDate: '1820-01-01'
    coralDescription: Flexible fan-shaped colony providing nursery habitat.
  - coralId: 4
    coralName: Black Wire Coral
    familyId: 4
    familyName: Antipathidae
    habitatId: 5
    habitatName: Deep Water Canyon
    coralType: black
    maxDepth: 200
    colorPattern: Black
    conservationStatus: NT
    isEndangered: false
    discoveryDate: '1830-01-01'
    coralDescription: Deep-sea coral with dark, wire-like branches; extremely slow-growing.
  - coralId: 5
    coralName: Pillar Coral
    familyId: 5
    familyName: Dendrophylliidae
    habitatId: 1
    habitatName: Great Barrier Reef
    coralType: hard
    maxDepth: 25
    colorPattern: Brown with white tips
    conservationStatus: VU
    isEndangered: true
    discoveryDate: '1840-01-01'
    coralDescription: Tall column-like structures; one of the few corals that extends polyps by day.
  - coralId: 6
    coralName: Elkhorn Coral
    familyId: 1
    familyName: Acroporidae
    habitatId: 3
    habitatName: Caribbean Reef System
    coralType: hard
    maxDepth: 8
    colorPattern: Tan with white branch tips
    conservationStatus: CR
    isEndangered: true
    discoveryDate: '1758-01-01'
    coralDescription: Critically endangered; once the dominant shallow-reef coral in the Caribbean.
  - coralId: 7
    coralName: Fire Coral
    familyId: 6
    familyName: Milleporidae
    habitatId: 2
    habitatName: Coral Triangle
    coralType: fire
    maxDepth: 30
    colorPattern: Yellow-brown with white tips
    conservationStatus: NT
    isEndangered: false
    discoveryDate: '1760-01-01'
    coralDescription: Not a true coral; venomous nematocysts cause painful burning sensations.
  - coralId: 8
    coralName: Star Coral
    familyId: 7
    familyName: Siderastreidae
    habitatId: 1
    habitatName: Great Barrier Reef
    coralType: hard
    maxDepth: 30
    colorPattern: Pale green with star-shaped polyps
    conservationStatus: LC
    isEndangered: false
    discoveryDate: '1770-01-01'
    coralDescription: Dome-shaped reef builder; highly tolerant of turbid conditions.
  - coralId: 9
    coralName: Mushroom Coral
    familyId: 8
    familyName: Fungiidae
    habitatId: 4
    habitatName: Pacific Atoll Lagoon
    coralType: hard
    maxDepth: 20
    colorPattern: Pink-grey with radial septa
    conservationStatus: LC
    isEndangered: false
    discoveryDate: '1780-01-01'
    coralDescription: Free-living solitary polyp that can right itself when overturned.
  - coralId: 10
    coralName: Table Coral
    familyId: 1
    familyName: Acroporidae
    habitatId: 2
    habitatName: Coral Triangle
    coralType: hard
    maxDepth: 30
    colorPattern: Brown with flat canopy
    conservationStatus: VU
    isEndangered: true
    discoveryDate: '1790-01-01'
    coralDescription: Flat-table growth form that shades substrate; dominates mid-reef slopes.

marine.habitat:
  - habitatId: 1
    habitatName: Great Barrier Reef
    habitatType: reef
    zone: shallow
    oceanZone: sunlight
    region: Indo-Pacific
    minDepth: 0
    maxDepth: 40
    waterTempMin: 23
    waterTempMax: 29
    latitude: -18.3
    longitude: 147.7
    protectionStatus: true
    habitatDescription: Largest coral reef system on Earth; stretches 2,300 km along Australia's coast.
  - habitatId: 2
    habitatName: Coral Triangle
    habitatType: reef
    zone: shallow
    oceanZone: sunlight
    region: Indo-Pacific
    minDepth: 0
    maxDepth: 60
    waterTempMin: 25
    waterTempMax: 30
    latitude: 3.5
    longitude: 126.5
    protectionStatus: false
    habitatDescription: Global centre of marine biodiversity; spans 6 nations and 6 million km².
  - habitatId: 3
    habitatName: Caribbean Reef System
    habitatType: reef
    zone: shallow
    oceanZone: sunlight
    region: Caribbean
    minDepth: 0
    maxDepth: 30
    waterTempMin: 25
    waterTempMax: 30
    latitude: 15.5
    longitude: -66.3
    protectionStatus: true
    habitatDescription: Largest Atlantic reef system; home to many critically endangered coral species.
  - habitatId: 4
    habitatName: Pacific Atoll Lagoon
    habitatType: lagoon
    zone: lagoon
    oceanZone: sunlight
    region: Micronesia
    minDepth: 1
    maxDepth: 25
    waterTempMin: 26
    waterTempMax: 30
    latitude: 11.5
    longitude: 165.4
    protectionStatus: true
    habitatDescription: Sheltered atoll lagoon with calm, clear water and rich patch reefs.
  - habitatId: 5
    habitatName: Deep Water Canyon
    habitatType: deepwater
    zone: deep
    oceanZone: midnight
    region: Atlantic
    minDepth: 200
    maxDepth: 2000
    waterTempMin: 4
    waterTempMax: 8
    latitude: 38.0
    longitude: -28.5
    protectionStatus: false
    habitatDescription: Cold, dark canyon habitat for deep-sea corals and diverse invertebrates.

marine.species:
  - speciesId: 1
    speciesName: Clownfish
    scientificName: Amphiprion ocellaris
    genus: Amphiprion
    species: ocellaris
    familyId: 1
    conservationStatus: LC
    bodyLength: 11
    lifespan: 10
    diet: omnivore
    speciesDescription: Iconic reef fish living in symbiosis with sea anemones.
  - speciesId: 2
    speciesName: Blue Tang
    scientificName: Paracanthurus hepatus
    genus: Paracanthurus
    species: hepatus
    familyId: 2
    conservationStatus: LC
    bodyLength: 31
    lifespan: 25
    diet: herbivore
    speciesDescription: Vibrant blue surgeonfish; grazes algae to maintain reef health.
  - speciesId: 3
    speciesName: Nurse Shark
    scientificName: Ginglymostoma cirratum
    genus: Ginglymostoma
    species: cirratum
    familyId: 3
    conservationStatus: VU
    bodyLength: 270
    lifespan: 25
    diet: carnivore
    speciesDescription: Sluggish bottom-dwelling shark that rests in groups during the day.
  - speciesId: 4
    speciesName: Green Sea Turtle
    scientificName: Chelonia mydas
    genus: Chelonia
    species: mydas
    familyId: 4
    conservationStatus: EN
    bodyLength: 150
    lifespan: 80
    diet: herbivore
    isEndangered: true
    speciesDescription: Herbivorous sea turtle that grazes seagrass and algae beds.
  - speciesId: 5
    speciesName: Mandarinfish
    scientificName: Synchiropus splendidus
    genus: Synchiropus
    species: splendidus
    familyId: 2
    conservationStatus: LC
    bodyLength: 7
    lifespan: 10
    diet: carnivore
    speciesDescription: Among the most visually striking reef fish; feeds on small crustaceans.
  - speciesId: 6
    speciesName: Lionfish
    scientificName: Pterois volitans
    genus: Pterois
    species: volitans
    familyId: 3
    conservationStatus: LC
    bodyLength: 38
    lifespan: 10
    diet: carnivore
    speciesDescription: Venomous invasive species threatening Atlantic reefs outside its native range.
`;
