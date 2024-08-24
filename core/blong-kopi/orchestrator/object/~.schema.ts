/* eslint-disable indent,semi */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @rushstack/typedef-var */

import {validationHandlers} from '@feasibleone/blong';
import {Static, Type} from '@sinclair/typebox';

type $subject$ObjectPredicate = Static<typeof $subject$ObjectPredicate>;
const $subject$ObjectPredicate = Type.Function(
    [Type.Object({})],
    Type.Promise(
        Type.Object({
            $objectId: Type.String(),
        })
    )
);

export default validationHandlers({
    $subject$ObjectPredicate,
});

declare module '@feasibleone/blong' {
    interface IRemoteHandler {
        $subject$ObjectPredicate<T = ReturnType<$subject$ObjectPredicate>>(
            params: Parameters<$subject$ObjectPredicate>[0],
            $meta: IMeta
        ): T;
    }
}
