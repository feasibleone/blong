import {IMeta, handler} from '@feasibleone/blong';

/** @description "Calculate age" */
type Handler = (params: {
    /** @description "Birth Date" */
    birthDate: string;
}) => Promise<{
    /** @description "Age in years" */
    age: number;
}>;

export default handler(
    ({lib: {age}}) =>
        async function subjectAge(
            {birthDate}: Parameters<Handler>[0],
            $meta: IMeta
        ): ReturnType<Handler> {
            $meta.httpResponse = {
                header: [
                    ['h1', 1],
                    ['h2', 2],
                ],
            };
            return {age: age(new Date(birthDate))};
        }
);
