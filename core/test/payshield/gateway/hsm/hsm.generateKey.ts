import {validation} from '@feasibleone/blong';

export default validation(({lib: {type, keyScheme}}) => ({
    hsmGenerateKey: () => ({
        description: 'generateKey',
        params: type.Object({
            mode: type.Union([
                type.Literal('0'),
                type.Literal('1'),
                type.Literal('A'),
                type.Literal('B'),
            ]),
            keyType: type.String(),
            keySchemeLmk: keyScheme,
        }),
        result: type.Object({
            key: type.String(),
            kcv: type.String(),
            keyZmk: type.Optional(type.String()),
        }),
    }),
}));
