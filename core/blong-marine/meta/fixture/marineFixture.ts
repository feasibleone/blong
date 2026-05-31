import {handler} from '@feasibleone/blong';
import {marineYaml} from '@feasibleone/marine-data';

export default handler(
    ({lib: {yaml}}) =>
        async function marineFixture() {
            return yaml.parse(marineYaml);
        },
);
