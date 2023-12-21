import bitsyntax from 'ut-bitsyntax';
import { handler } from '@feasibleone/blong';

export default handler(({
    config: {
        headerFormat,
        maskedKeys
    },
    lib: {
        errors,
        commands,
        commandNames,
        mask
    }
}) => {
    const headerMatcher = bitsyntax.matcher('headerNo:' + headerFormat + ', code:2/string, body/binary');
    const errorMatcher = bitsyntax.matcher('errorCode:2/string, rest/binary');

    return function decode(buff, $meta, context, log) {
        const header: {body: unknown, code: string, headerNo: unknown} = headerMatcher(buff);
        if (!header) throw errors['payshield.unableMatchingHeaderPattern']({});
        const commandName = commandNames[header.code];
        if (!commandName) throw errors['payshield.unknownResponseCode']({params: {code: header.code}});
        const command = commands[commandName];
        if (!command) throw errors['payshield.notImplemented']({params: {opcode: commandName}});

        let result: {errorCode: string} = errorMatcher(header.body);
        if (!result) throw errors['payshield.unableMatchingResponseECode']({});
        // 00 = No error
        // 02 = Key inappropriate length for algorithm (in some cases is warning)
        const warning = (command.warnings && ['00'].concat(command.warnings)) || ['00'];
        $meta.trace = header.headerNo;
        $meta.method = command.method;
        if (warning.includes(result.errorCode)) {
            result = command.matcher(header.body);
            if (!result) throw errors['payshield.unableMatchingPattern']({params: {opcode: commandName}});
            $meta.mtid = command.mtid;
        } else {
            let errorCode = 'generic';
            $meta.mtid = 'error';
            if (command.errorMatcher) { // try to match errorPattern if it exists
                errorCode = (command.errorMatcher(header.body) || result).errorCode || errorCode;
            } else if (result && result.errorCode) {
                errorCode = result.errorCode;
            }
            const error = (errors[`payshield.${command.method}.${errorCode}`] || errors[`payshield.${errorCode}`])({});
            log?.error?.(error);
            return error;
        }
        log?.trace?.({
            $meta: {mtid: 'frame', method: 'payshield.decode'},
            message: mask(
                buff.toString(),
                result, {
                    pattern: command.pattern,
                    maskedKeys,
                    maskSymbol: '*'
                }),
            log: context?.session?.log
        });
        return result;
    };
});
