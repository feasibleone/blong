import {library} from '@feasibleone/blong';

export default library(
    proxy =>
        function mask(
            message: string,
            data: object,
            {
                pattern,
                maskedKeys,
                maskSymbol,
            }: {
                pattern: {
                    name: string;
                    type: 'string' | unknown;
                    binhex: unknown;
                    binary: unknown;
                    z: unknown;
                }[];
                maskedKeys: string[];
                maskSymbol: string;
            }
        ) {
            return (maskedKeys || [])
                .filter(key => pattern.find(element => element.name === key))
                .map(key => {
                    const patternElement = pattern.find(v => key === v.name);
                    switch (patternElement.type) {
                        case 'string':
                            if (patternElement.binhex) {
                                return (
                                    (data[key] && {
                                        key,
                                        value: Buffer.from(data[key], 'hex').toString(),
                                        replaceValue: maskSymbol.repeat(data[key].length * 2),
                                    }) ||
                                    false
                                );
                            } else if (patternElement.binary) {
                                return false;
                            } else if (patternElement.z) {
                                return false;
                            } else {
                                return (
                                    (data[key] && {
                                        key,
                                        value: data[key],
                                        replaceValue: maskSymbol.repeat(data[key].length),
                                    }) ||
                                    false
                                );
                            }
                        default:
                            return false;
                    }
                })
                .filter(Boolean)
                .reduce(
                    (buf, maskThis) =>
                        maskThis && buf.split(maskThis.value).join(maskThis.replaceValue),
                    message
                )
                .toUpperCase();
        }
);
