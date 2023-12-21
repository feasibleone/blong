import { createRequire } from 'node:module';
import bitsyntax from 'ut-bitsyntax';

import { handler } from '@feasibleone/blong';

export default handler(({
    config,
    lib: {
        errors,
        commands,
        lmk,
        upperCaseObject,
        mask
    }
}) => {
    const nonCorrectableFields = Object.assign({}, createRequire(import.meta.url)('./fields.json'), config.nonCorrectableFields);
    const headerPattern = bitsyntax.parse('headerNo:' + config.headerFormat + ', code:2/string, body/binary');

    if (headerPattern === false) {
        throw errors['payshield.parser.header']({});
    }

    const headerNoSize = headerPattern.filter(value => value.name === 'headerNo').pop().size;
    const maxTrace = parseInt('9'.repeat(headerNoSize));

    return function encode(data, $meta, context, log) {
        const commandName = $meta.method.split('.').pop() + ':' + $meta.mtid;

        if (commands[commandName] === undefined) throw errors['payshield.notImplemented']({params: {opcode: commandName}});

        let headerNo = ($meta.mtid === 'request') ? null : $meta.trace;
        if (headerNo === undefined || headerNo === null) {
            headerNo = $meta.trace = ('0'.repeat(headerNoSize) + context.trace).substr(-headerNoSize);
            context.trace += 1;
            if (context.trace > maxTrace) {
                context.trace = 0;
            }
        }
        const dataCorrected = upperCaseObject(lmk(data), nonCorrectableFields);
        const bodyBuff = bitsyntax.build(commands[commandName].pattern, dataCorrected);
        if (!bodyBuff) throw errors['payshield.parser.body']({params: {command: commandName}});

        const buffer = bitsyntax.build(headerPattern, {
            headerNo,
            code: commands[commandName].code,
            body: bodyBuff
        });
        log?.trace?.({
            $meta: {mtid: 'frame', method: 'payshield.encode'},
            message: mask(
                buffer.toString(),
                dataCorrected, {
                    pattern: commands[commandName].pattern,
                    maskedKeys: config.maskedKeys,
                    maskSymbol: '*'
                }),
            log: context?.session?.log
        });
        return buffer;
    };
});
