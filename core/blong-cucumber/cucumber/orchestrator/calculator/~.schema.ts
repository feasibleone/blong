/* eslint-disable indent,semi */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @rushstack/typedef-var */

import {validationHandlers, type IMeta} from '@feasibleone/blong';
import {Type, type Static} from 'typebox';

type cucumberCalculatorAdd = Static<typeof cucumberCalculatorAdd>;
const cucumberCalculatorAdd = Type.Function(
    [Type.Object({a: Type.Number(), b: Type.Number()})],
    Type.Promise(Type.Number()),
    {description: 'Add two numbers'},
);

type cucumberCalculatorSubtract = Static<typeof cucumberCalculatorSubtract>;
const cucumberCalculatorSubtract = Type.Function(
    [Type.Object({a: Type.Number(), b: Type.Number()})],
    Type.Promise(Type.Number()),
    {description: 'Subtract b from a'},
);

export default validationHandlers({
    cucumberCalculatorAdd,
    cucumberCalculatorSubtract,
});

declare module '@feasibleone/blong' {
    interface IRemoteHandler {
        cucumberCalculatorAdd<T = ReturnType<cucumberCalculatorAdd>>(
            params: Parameters<cucumberCalculatorAdd>[0],
            $meta: IMeta,
        ): T;
        cucumberCalculatorSubtract<T = ReturnType<cucumberCalculatorSubtract>>(
            params: Parameters<cucumberCalculatorSubtract>[0],
            $meta: IMeta,
        ): T;
    }
}
