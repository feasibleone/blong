import { library } from '@feasibleone/blong';

export default library<{
    pciDssMode: string,
    lmkIdentifierDefault: string
}>(({
    config: {
        pciDssMode,
        lmkIdentifierDefault
    },
    handler: {
        'payshield.generateKey': generateKey,
        'error.ctp.hsm.invalidParameters': invalidParameters
    },
    lib: {
        assert,
        keysByType
    }
}) => ({
    // A0 (A1) - Generate a Key
    async generateKey({
        mode,
        keyType,
        keySchemeLmk,
        keyZmkTmkFlag,
        keyZmkTmk,
        keySchemeZmkTmk,
        deriveKeyMode,
        dukptMasterKeyType,
        dukptMasterKey,
        ksn,
        zkaMasterKeyType,
        zkaMasterKey,
        zkaOption,
        zkaRndi,
        tr31BlockData,
        lmkIdentifier = lmkIdentifierDefault
    } : Record<string, string>, $meta) {
        // zkaMasterKeyType:
        // - 607 - ZKAMK
        const keyTypeCode = assert(!pciDssMode, true, 'keyTypeCodeNonPci', 'keyTypeCodePci');
        let delimiter;
        let tr31BlockDataLen;

        mode = mode.toString().toUpperCase();

        if (['A', 'B'].includes(mode)) {
            if (deriveKeyMode === '1') {
                dukptMasterKeyType = '';
                dukptMasterKey = '';
                ksn = '';
                zkaMasterKeyType = assert(!!keysByType[zkaMasterKeyType], true, keysByType[zkaMasterKeyType][keyTypeCode], '');
                zkaRndi = assert(zkaOption, '0', zkaRndi, '');
            } else if (deriveKeyMode === '0') {
                zkaMasterKeyType = '';
                zkaMasterKey = '';
                zkaOption = '';
                zkaRndi = '';
            } else {
                throw invalidParameters();
            }
        } else {
            deriveKeyMode = '';
            dukptMasterKeyType = '';
            dukptMasterKey = '';
            ksn = '';
            zkaMasterKeyType = '';
            zkaMasterKey = '';
            zkaOption = '';
            zkaRndi = '';
        }

        const deriveKeyModeLen = deriveKeyMode.length;
        const dukptMasterKeyTypeLen = dukptMasterKeyType.length;
        const dukptMasterKeyLen = dukptMasterKey.length;
        const ksnLength = ksn.length; // MAX 15 without counter.
        const zkaMasterKeyTypeLength = zkaMasterKeyType.length;
        const zkaMasterKeyLength = zkaMasterKey.length;
        const zkaOptionLength = zkaOption.length;
        const zkaRndiLength = zkaRndi.length;

        if (['1', 'B'].includes(mode)) {
            delimiter = ';';
        } else {
            delimiter = '';
            keyZmkTmkFlag = '';
            keyZmkTmk = '';
            keySchemeZmkTmk = '';
        }

        const delimiterLength = delimiter.length;
        const keyZmkTmkFlagLength = assert(!!keyZmkTmkFlag, true, () => keyZmkTmkFlag.toString().length, 0);
        const keyZmkTmkLength = assert(!!keyZmkTmk, true, () => keyZmkTmk.length, 0);
        const keySchemeZmkTmkLength = assert(!!keySchemeZmkTmk, true, () => keySchemeZmkTmk.length, 0);

        if (['R', 'S'].includes(keySchemeZmkTmk)) {
            tr31BlockDataLen = tr31BlockData.length;
        } else {
            tr31BlockDataLen = 0;
            tr31BlockData = '';
        }

        const {key, rest} = await generateKey<{key: string, rest: string}>({
            mode,
            keyType: assert(!!keysByType[keyType], true, keysByType[keyType][keyTypeCode], ''),
            keySchemeLmk,
            deriveKeyModeLen,
            deriveKeyMode,
            dukptMasterKeyTypeLen,
            dukptMasterKeyType,
            dukptMasterKeyLen,
            dukptMasterKey,
            ksnLength,
            ksn,
            delimiterLength,
            delimiter,
            keyZmkTmkFlagLength,
            keyZmkTmkFlag,
            keyZmkTmkLength,
            keyZmkTmk,
            keySchemeZmkTmkLength,
            keySchemeZmkTmk,
            zkaMasterKeyTypeLength,
            zkaMasterKeyType,
            zkaMasterKeyLength,
            zkaMasterKey,
            zkaOptionLength,
            zkaOption,
            zkaRndiLength,
            zkaRndi,
            tr31BlockDataLen,
            tr31BlockData,
            lmkIdentifier
        }, $meta);
        let {counter, restString, returnResult} = {counter: 0, restString: String.fromCharCode.apply(null, Buffer.from(rest, 'hex')), returnResult: {key, keyZmk: undefined, kcv: undefined}};

        if (['1', 'B'].includes(mode)) {
            returnResult.keyZmk = restString.slice(counter, counter + 33);
            counter += 33;
        }
        returnResult.kcv = restString.slice(counter, counter + 6);
        counter += 6;
        returnResult = Object.assign({}, returnResult, assert(zkaOption, '1', {zkaRndi: restString.slice(counter)}, {}));

        return returnResult;
    }
}));
