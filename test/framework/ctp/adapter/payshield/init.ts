import {createRequire} from 'node:module';
import bitsyntax from 'ut-bitsyntax';

import {library, type Errors} from '@feasibleone/blong';

export default library(({config: {messageFormat}, lib: {merge}, lib}) => {
    const messages = Object.entries<{
        warnings?: string[];
        requestPattern?: string;
        requestCode: string;
        responsePattern?: string;
        responseCode: string;
        errorPattern?: string;
    }>(merge({}, createRequire(import.meta.url)('./messages.json'), messageFormat));
    const errors = lib.errors as unknown as Errors<{
        'payshield.parser.request': unknown;
        'payshield.parser.parserResponse': unknown;
    }>;
    return {
        commandNames: messages.reduce(
            (prev, [name, {requestPattern, responsePattern, requestCode, responseCode}]) => {
                if (requestPattern) prev[requestCode] = name + ':request';
                if (responsePattern) prev[responseCode] = name + ':response';
                return prev;
            },
            {} as Record<string, string>,
        ),
        commands: messages.reduce(
            (
                prev,
                [
                    name,
                    {
                        requestPattern,
                        requestCode,
                        warnings,
                        responsePattern,
                        responseCode,
                        errorPattern,
                    },
                ],
            ) => {
                if (requestPattern) {
                    const pattern = bitsyntax.parse(requestPattern);
                    if (!pattern)
                        throw errors['payshield.parser.request']({params: {command: name}});
                    prev[name + ':request'] = {
                        pattern,
                        matcher: bitsyntax.matcher(requestPattern),
                        code: requestCode,
                        warnings,
                        method: name,
                        mtid: 'request',
                    };
                }
                if (responsePattern) {
                    const pattern = bitsyntax.parse(responsePattern);
                    if (!pattern)
                        throw errors['payshield.parser.parserResponse']({params: {command: name}});
                    prev[name + ':response'] = {
                        pattern,
                        matcher: bitsyntax.matcher(responsePattern),
                        errorMatcher: errorPattern && bitsyntax.matcher(errorPattern),
                        code: responseCode,
                        warnings,
                        method: name,
                        mtid: 'response',
                    };
                }
                return prev;
            },
            {} as Record<string, unknown>,
        ),
    };
});
