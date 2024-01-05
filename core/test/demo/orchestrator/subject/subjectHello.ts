import {IMeta, handler} from '@feasibleone/blong';

interface ISchema {
    params: unknown;
    result: {
        hello: unknown;
    };
}

export default handler(
    proxy =>
        function subjectHello(params: ISchema['params'], $meta: IMeta): ISchema['result'] {
            return {hello: $meta.auth};
        }
);
