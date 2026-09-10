import {handler} from '@feasibleone/blong';

import type {TextParams} from './textInput.ts';

/** The group's library functions, as the proxy attaches them. */
type TextLib = {textInput: (params: TextParams) => string};

/**
 * `text.slug.get` — a URL-friendly form of the input.
 *
 * One function in one file, and the file name is the semantic triple: subject
 * `text` (the namespace), object `slug`, predicate `get`. The registered method
 * name is the same triple run together, which is what the gateway's
 * `/rpc/text/slug/get` normalises to.
 *
 * Note the call is `(lib as …).textInput(params)` — a *member* call, not a
 * destructured one. A library function reads the platform off `this`, and
 * assigning it to a local first would strip the receiver and leave `this`
 * undefined.
 */
export default handler(({lib}) => ({
    textSlugGet: (params: TextParams): string =>
        String((lib as unknown as TextLib).textInput(params))
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, ''),
}));
