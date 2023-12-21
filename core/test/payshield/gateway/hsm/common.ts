import { validation } from '@feasibleone/blong';

export default validation(({lib: {Type}}) => ({
    keyScheme: Type.Union([
        Type.Literal('U'),
        Type.Literal('X'),
        Type.Literal('R'),
        Type.Literal('S'),
        Type.Literal('T'),
        Type.Literal('Y'),
        Type.Literal('V')
    ])
}));
