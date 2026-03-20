import {library} from '@feasibleone/blong';

/**
 * Helper utilities for HSM key type resolution.
 */
export default library(() => ({
    /**
     * Conditional value selector (ternary helper).
     */
    assert(checkWhat: unknown, compareTo: unknown, ifTrue: unknown, ifFalse: unknown) {
        if (checkWhat === compareTo) {
            if (typeof ifTrue === 'function') {
                return ifTrue();
            }
            return ifTrue;
        }
        if (typeof ifFalse === 'function') {
            return ifFalse();
        }
        return ifFalse;
    },

    /**
     * Maps business key type names to Payshield key type codes.
     * Used to translate the keyType parameter into the device-specific code.
     */
    keysByType: {
        ZMK: {
            keyTypeCodePci: '000',
            keyTypeCodeNonPci: '000',
            description: 'Zone Master Key (also known as ZCMK)',
        },
        ZPK: {
            keyTypeCodePci: '001',
            keyTypeCodeNonPci: '001',
            description: 'Zone PIN Key',
        },
        PVK: {
            keyTypeCodePci: '002',
            keyTypeCodeNonPci: '002',
            description: 'PIN Verification Key',
        },
        TAK: {
            keyTypeCodePci: '003',
            keyTypeCodeNonPci: '003',
            description: 'Terminal Authentication Key',
        },
        CVK: {
            keyTypeCodePci: '402',
            keyTypeCodeNonPci: '402',
            description: 'Card Verification Key',
        },
    },
}));
