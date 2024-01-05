import {validation} from '@feasibleone/blong';

export default validation(({lib: {type, keyScheme}}) => ({
    payshieldGenerateKey: () => ({
        auth: false,
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
        result: type.Any(),
    }),
}));
