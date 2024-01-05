import {IMeta, handler} from '@feasibleone/blong';

interface ISchema {
    params: unknown;
    result: {
        abbreviation?: string;
    };
}

export default handler(
    ({handler: {timeGet}}) =>
        async function subjectTime(
            params: ISchema['params'],
            $meta: IMeta
        ): Promise<ISchema['result']> {
            return timeGet(params, $meta);
        }
);
