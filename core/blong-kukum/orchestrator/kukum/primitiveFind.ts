import {library} from '@feasibleone/blong';
import {describePrimitives} from '../../operation.ts';

/** `kukum.primitive.find` — the primitive catalogue, with each primitive's kinds. */
export default library(
    () =>
        function primitiveFind(_params?: unknown) {
            return describePrimitives();
        },
);
