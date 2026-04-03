/** Mock data for marine biology Storybook stories */

export const mockCorals = [
    {coralId: 'c1', coralName: 'Brain Coral', scientificName: 'Diploria labyrinthiformis', coralType: 'hard', maxDepth: 50, endangered: false, iucnStatus: 'LC'},
    {coralId: 'c2', coralName: 'Staghorn Coral', scientificName: 'Acropora cervicornis', coralType: 'hard', maxDepth: 30, endangered: true, iucnStatus: 'CR'},
    {coralId: 'c3', coralName: 'Sea Fan', scientificName: 'Gorgonia ventalina', coralType: 'soft', maxDepth: 25, endangered: false, iucnStatus: 'LC'},
    {coralId: 'c4', coralName: 'Fire Coral', scientificName: 'Millepora alcicornis', coralType: 'fire', maxDepth: 40, endangered: false, iucnStatus: 'NT'},
    {coralId: 'c5', coralName: 'Elkhorn Coral', scientificName: 'Acropora palmata', coralType: 'hard', maxDepth: 8, endangered: true, iucnStatus: 'CR'},
    {coralId: 'c6', coralName: 'Pillar Coral', scientificName: 'Dendrogyra cylindrus', coralType: 'hard', maxDepth: 20, endangered: true, iucnStatus: 'VU'},
    {coralId: 'c7', coralName: 'Tube Coral', scientificName: 'Cladocora caespitosa', coralType: 'hard', maxDepth: 50, endangered: false, iucnStatus: 'NT'},
    {coralId: 'c8', coralName: 'Leather Coral', scientificName: 'Sarcophyton trocheliophorum', coralType: 'soft', maxDepth: 30, endangered: false, iucnStatus: 'LC'},
];

export const mockHabitats = [
    {habitatId: 'h1', habitatName: 'Great Barrier Reef', habitatType: 'reef', oceanZone: 'sunlight', latitude: -18.286, longitude: 147.7, protectionStatus: true},
    {habitatId: 'h2', habitatName: 'Coral Triangle', habitatType: 'reef', oceanZone: 'sunlight', latitude: 3.5, longitude: 126.5, protectionStatus: false},
    {habitatId: 'h3', habitatName: 'Caribbean Reef System', habitatType: 'reef', oceanZone: 'sunlight', latitude: 15.5, longitude: -66.3, protectionStatus: true},
    {habitatId: 'h4', habitatName: 'Pacific Atoll', habitatType: 'atoll', oceanZone: 'sunlight', latitude: 11.5, longitude: 165.4, protectionStatus: true},
    {habitatId: 'h5', habitatName: 'Florida Keys Lagoon', habitatType: 'lagoon', oceanZone: 'sunlight', latitude: 24.8, longitude: -81.0, protectionStatus: false},
];

export const mockFamilies = [
    {familyId: 'f1', familyName: 'Acroporidae', order: 'Scleractinia', class_: 'Anthozoa', speciesCount: 352},
    {familyId: 'f2', familyName: 'Faviidae', order: 'Scleractinia', class_: 'Anthozoa', speciesCount: 95},
    {familyId: 'f3', familyName: 'Gorgoniidae', order: 'Alcyonacea', class_: 'Anthozoa', speciesCount: 80},
    {familyId: 'f4', familyName: 'Sarcophytidae', order: 'Alcyonacea', class_: 'Anthozoa', speciesCount: 40},
];

export const mockSpecies = [
    {speciesId: 's1', speciesName: 'Clownfish', genus: 'Amphiprion', species: 'ocellaris', familyId: 'f1', bodyLength: 11, lifespan: 10, diet: 'omnivore'},
    {speciesId: 's2', speciesName: 'Blue Tang', genus: 'Paracanthurus', species: 'hepatus', familyId: 'f2', bodyLength: 31, lifespan: 25, diet: 'herbivore'},
    {speciesId: 's3', speciesName: 'Nurse Shark', genus: 'Ginglymostoma', species: 'cirratum', familyId: 'f3', bodyLength: 270, lifespan: 25, diet: 'carnivore'},
    {speciesId: 's4', speciesName: 'Green Sea Turtle', genus: 'Chelonia', species: 'mydas', familyId: 'f4', bodyLength: 150, lifespan: 80, diet: 'herbivore', endangered: true},
];
