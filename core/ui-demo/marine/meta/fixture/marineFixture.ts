import {handler} from '@feasibleone/blong';

export default handler(
    ({lib: {yaml}}) =>
        async function marineFixture() {
            return yaml.parse(`
                marine.coral:
                    - coralId: 1
                      coralName: Staghorn Coral
                      familyId: 1
                      familyName: Acroporidae
                      habitatId: 1
                      habitatName: Coral Reef
                      maxDepth: 30
                      colorPattern: Brown with white tips
                      discovered: 1758-01-01
                      description: Staghorn coral is a fast-growing species that provides important habitat for marine life.
                    - coralId: 2
                      coralName: Brain Coral
                      familyId: 2
                      familyName: Faviidae
                      habitatId: 2
                      habitatName: Lagoon
                      maxDepth: 20
                      colorPattern: Green with ridges
                      discovered: 1801-01-01
                      description: Brain coral is known for its grooved surface and slow growth, often living for centuries.
                marine.family:
                    - familyId: 1
                      familyName: Acroporidae
                    - familyId: 2
                      familyName: Faviidae
                marine.habitat:
                    - habitatId: 1
                      habitatName: Coral Reef
                    - habitatId: 2
                      habitatName: Lagoon
            `);
        },
);
