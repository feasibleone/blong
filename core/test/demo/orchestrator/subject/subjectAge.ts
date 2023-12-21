import { handler } from '@feasibleone/blong';

interface schema {
    /** */
    params: {
        /** @description "Birth Date" */
        birthDate: string
    }
    result: {
        age: number
    }
}

export default handler(({
    lib: {
        age
    }
}) => function subjectAge({birthDate}: schema['params'], $meta): schema['result'] {
    $meta.httpResponse = {
        header: [['h1', 1], ['h2', 2]]
    };
    return {age: age(new Date(birthDate))};
});
