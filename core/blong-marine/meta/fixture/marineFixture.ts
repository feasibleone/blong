import {handler} from '@feasibleone/blong';
import {marineYaml} from '../../data/index.ts';

export default handler(
    ({lib: {yaml}}) =>
        async function marineFixture() {
            return yaml.parse(marineYaml);
        },
);
