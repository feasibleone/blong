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
                    - coralId: 3
                      coralName: Sea Fan
                      familyId: 3
                      familyName: Gorgoniidae
                      habitatId: 3
                      habitatName: Reef Crest
                      maxDepth: 15
                      colorPattern: Purple with white tips
                      discovered: 1820-01-01
                      description: Sea fans are flexible, fan-shaped corals that provide habitat for many marine species.
                    - coralId: 4
                      coralName: Black Wire Coral
                      familyId: 4
                      familyName: Antipathidae
                      habitatId: 4
                      habitatName: Deep Sea
                      maxDepth: 200
                      colorPattern: Black
                      discovered: 1830-01-01
                      description: Black wire coral is a deep-sea coral known for its dark, wire-like branches.
                    - coralId: 5
                      coralName: Pillar Coral
                      familyId: 5
                      familyName: Dendrophylliidae
                      habitatId: 5
                      habitatName: Coral Reef
                      maxDepth: 25
                      colorPattern: Brown with white tips
                      discovered: 1840-01-01
                      description: Pillar coral forms tall, column-like structures in coral reefs.
                    - coralId: 6
                      coralName: Elkhorn Coral
                      familyId: 1
                      familyName: Acroporidae
                      habitatId: 1
                      habitatName: Coral Reef
                      maxDepth: 30
                      colorPattern: Brown with white tips
                      discovered: 1758-01-01
                      description: Elkhorn coral is a fast-growing species that provides important habitat for marine life.
                    - coralId: 7
                      coralName: Fire Coral
                      familyId: 6
                      familyName: Milleporidae
                      habitatId: 1
                      habitatName: Coral Reef
                      maxDepth: 30
                      colorPattern: Yellow with brown tips
                      discovered: 1760-01-01
                      description: Fire coral is known for its stinging cells and bright coloration.
                    - coralId: 8
                      coralName: Star Coral
                      familyId: 7
                      familyName: Siderastreidae
                      habitatId: 1
                      habitatName: Coral Reef
                      maxDepth: 30
                      colorPattern: Brown with white tips
                      discovered: 1770-01-01
                      description: Star coral is a reef-building coral known for its star-shaped polyps.
                    - coralId: 9
                      coralName: Mushroom Coral
                      familyId: 8
                      familyName: Fungiidae
                      habitatId: 2
                      habitatName: Lagoon
                      maxDepth: 20
                      colorPattern: Green with ridges
                      discovered: 1780-01-01
                      description: Mushroom coral is a solitary coral that resembles a mushroom cap.
                    - coralId: 10
                      coralName: Table Coral
                      familyId: 1
                      familyName: Acroporidae
                      habitatId: 1
                      habitatName: Coral Reef
                      maxDepth: 30
                      colorPattern: Brown with white tips
                      discovered: 1790-01-01
                      description: Table coral forms flat, table-like structures in coral reefs.
                marine.family:
                    - familyId: 1
                      familyName: Acroporidae
                    - familyId: 2
                      familyName: Faviidae
                    - familyId: 3
                      familyName: Gorgoniidae
                    - familyId: 4
                      familyName: Antipathidae
                    - familyId: 5
                      familyName: Dendrophylliidae
                    - familyId: 6
                      familyName: Milleporidae
                    - familyId: 7
                      familyName: Siderastreidae
                    - familyId: 8
                      familyName: Fungiidae
                marine.habitat:
                    - habitatId: 1
                      habitatName: Coral Reef
                    - habitatId: 2
                      habitatName: Lagoon
            `);
        },
);
