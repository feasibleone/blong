import {library} from '@feasibleone/blong';
import {WELL_KNOWN_LAYERS} from '@feasibleone/blong-lib/layers';

/**
 * `kukum.activation.find` — layer → intent activation table.
 *
 * Straight from `WELL_KNOWN_LAYERS`, the same table the runtime discovers layers
 * with, so the answer cannot drift from the implementation.
 */
export default library(
    () =>
        function activationFind(_params?: unknown) {
            return WELL_KNOWN_LAYERS;
        },
);
