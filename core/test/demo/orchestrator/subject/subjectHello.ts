import { handler } from '@feasibleone/blong';

interface schema {
    params: unknown
    result: {
        hello: unknown
    }
}

export default handler(proxy => function subjectHello(params: schema['params'], $meta): schema['result'] {
    return {hello: $meta.auth};
});
