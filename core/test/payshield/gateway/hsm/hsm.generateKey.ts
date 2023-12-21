import { validation } from '@feasibleone/blong';

export default validation(({
    lib: {
        Type,
        keyScheme
    }
}) => ({
    'hsm.generateKey': () => ({
        auth: false,
        description: 'generateKey',
        params: Type.Object({
            mode: Type.Union([Type.Literal('0'), Type.Literal('1'), Type.Literal('A'), Type.Literal('B')]),
            keyType: Type.String(),
            keySchemeLmk: keyScheme
        }),
        result: Type.Object({
            key: Type.String(),
            kcv: Type.String(),
            keyZmk: Type.Optional(Type.String())
        })
    })
}));
