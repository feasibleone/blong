import {handler, type Errors, type IContext, type ILogger, type IMeta} from '@feasibleone/blong';
import bitsyntax from 'ut-bitsyntax';

export default handler(({config: {headerFormat, maskedKeys}, lib, lib: {mask}}) => {
    const errors = lib.errors as unknown as Errors<{
        [key: string]: unknown;
    }>;
    const commands = lib.commands as unknown as Record<
        string,
        {
            pattern: {name: string; size: number}[];
            code: string;
            warnings?: string[];
            method: string;
            mtid: 'request' | 'response';
            errorMatcher?: (...args: unknown[]) => {errorCode: string};
            matcher: (...args: unknown[]) => {errorCode: string};
        }
    >;
    const commandNames = lib.commandNames as unknown as Record<string, string>;
    const headerMatcher = bitsyntax.matcher(
        'headerNo:' + headerFormat + ', code:2/string, body/binary',
    ) as (...args: unknown[]) => {body: unknown; code: string; headerNo: string};
    const errorMatcher = bitsyntax.matcher('errorCode:2/string, rest/binary') as (
        ...args: unknown[]
    ) => {errorCode: string};

    return function decode(buff: Buffer, $meta: IMeta, context: IContext, log: ILogger) {
        const header: {body: unknown; code: string; headerNo: string} = headerMatcher(buff);
        if (!header) throw errors['payshield.unableMatchingHeaderPattern']({});
        const commandName = commandNames[header.code];
        if (!commandName)
            throw errors['payshield.unknownResponseCode']({params: {code: header.code}});
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
            if (!result)
                throw errors['payshield.unableMatchingPattern']({
                    params: {opcode: commandName},
                });
            $meta.mtid = command.mtid;
        } else {
            let errorCode = 'generic';
            $meta.mtid = 'error';
            if (command.errorMatcher) {
                // try to match errorPattern if it exists
                errorCode = (command.errorMatcher(header.body) || result).errorCode || errorCode;
            } else if (result && result.errorCode) {
                errorCode = result.errorCode;
            }
            const error = (
                errors[`payshield.${command.method}.${errorCode}`] ||
                errors[`payshield.${errorCode}`]
            )({});
            log?.error?.(error);
            return error;
        }
        log?.trace?.({
            $meta: {mtid: 'frame', method: 'payshield.decode'},
            message: mask(buff.toString(), result, {
                pattern: command.pattern,
                maskedKeys,
                maskSymbol: '*',
            }),
            log: context?.session?.log,
        });
        return result;
    };
});
