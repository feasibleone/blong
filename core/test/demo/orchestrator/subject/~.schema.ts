import {validationHandlers} from '@feasibleone/blong';
import {Type, type Static} from 'typebox';

type subjectAge = Static<typeof subjectAge>;
const subjectAge = Type.Function(
    [
        Type.Object({
            birthDate: Type.String({description: 'Birth Date'}),
        }),
    ],
    Type.Promise(
        Type.Object({
            age: Type.Number({description: 'Age in years'}),
        }),
    ),
    {description: 'Calculate age'},
);

type subjectHello = Static<typeof subjectHello>;
const subjectHello = Type.Function(
    [Type.Unknown()],
    Type.Promise(
        Type.Object({
            hello: Type.Unknown(),
        }),
    ),
);

type subjectNumberSum = Static<typeof subjectNumberSum>;
const subjectNumberSum = Type.Function([Type.Array(Type.Number())], Type.Promise(Type.Number()));

export default validationHandlers({
    subjectAge,
    subjectHello,
    subjectNumberSum,
});

declare module '@feasibleone/blong' {
    interface ISchema {
        subjectAge(params: Parameters<subjectAge>[0], $meta: IMeta): ReturnType<subjectAge>;
        subjectHello(params: Parameters<subjectHello>[0], $meta: IMeta): ReturnType<subjectHello>;
        subjectNumberSum(
            params: Parameters<subjectNumberSum>[0],
            $meta: IMeta,
        ): ReturnType<subjectNumberSum>;
    }
}
