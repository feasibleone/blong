import { handler } from '@feasibleone/blong';

interface schema {
    params: unknown
    result: {
        abbreviation?: string
    }
}

export default handler(({
    handler: {
        timeGet
    }
}) => async function subjectTime(params: schema['params'], $meta): Promise<schema['result']> {
    return timeGet(params, $meta);
});
