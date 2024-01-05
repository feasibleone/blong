import {validation} from '@feasibleone/blong';

export default validation(({lib: {type}}) => ({
    keyScheme: type.Union([
        type.Literal('U'),
        type.Literal('X'),
        type.Literal('R'),
        type.Literal('S'),
        type.Literal('T'),
        type.Literal('Y'),
        type.Literal('V'),
    ]),
}));
