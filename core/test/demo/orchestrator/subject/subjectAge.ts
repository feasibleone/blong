import {IMeta, handler} from '@feasibleone/blong';

interface ISchema {
    /** */
    params: {
        /** @description "Birth Date" */
        birthDate: string;
    };
    result: {
        age: number;
    };
}

export default handler(
    ({lib: {age}}) =>
        function subjectAge({birthDate}: ISchema['params'], $meta: IMeta): ISchema['result'] {
            $meta.httpResponse = {
                header: [
                    ['h1', 1],
                    ['h2', 2],
                ],
            };
            return {age: age(new Date(birthDate))};
        }
);
