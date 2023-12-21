import { createRequire } from 'node:module';
import bitsyntax from 'ut-bitsyntax';

import { library } from '@feasibleone/blong';

export default library(({
    config: {
        messageFormat
    },
    lib: {
        errors,
        merge
    }
}) => {
    const messages = Object.entries<{
        requestPattern?: string
        requestCode?: string
        warnings?: string[]
        responsePattern?: string
        responseCode?: string
        errorPattern?: string
    }>(merge({}, createRequire(import.meta.url)('./messages.json'), messageFormat));

    return {
        commandNames: messages.reduce((prev, [name, {requestPattern, responsePattern, requestCode, responseCode}]) => {
            if (requestPattern) prev[requestCode] = name + ':request';
            if (responsePattern) prev[responseCode] = name + ':response';
            return prev;
        }, {}),
        commands: messages.reduce((prev, [name, {
            requestPattern, requestCode, warnings, responsePattern, responseCode, errorPattern
        }]) => {
            if (requestPattern) {
                const pattern = bitsyntax.parse(requestPattern);
                if (!pattern) throw errors['payshield.parser.request']({params: {command: name}});
                prev[name + ':request'] = {
                    pattern,
                    matcher: bitsyntax.matcher(requestPattern),
                    code: requestCode,
                    warnings,
                    method: name,
                    mtid: 'request'
                };
            }
            if (responsePattern) {
                const pattern = bitsyntax.parse(responsePattern);
                if (!pattern) throw errors['payshield.parser.parserResponse']({params: {command: name}});
                prev[name + ':response'] = {
                    pattern,
                    matcher: bitsyntax.matcher(responsePattern),
                    errorMatcher: errorPattern && bitsyntax.matcher(errorPattern),
                    code: responseCode,
                    warnings,
                    method: name,
                    mtid: 'response'
                };
            }
            return prev;
        }, {})
    };
});
