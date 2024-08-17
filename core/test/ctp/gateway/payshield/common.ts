import {library} from '@feasibleone/blong';

export default library(({lib: {type}}) => ({
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
