import {validation} from '@feasibleone/blong';

/**
 * `blob.scope.issue` — mint the read cookie for the caller.
 *
 * Bearer auth by default: issuing a cookie is a write, and the scopes it carries are the caller's own.
 * `scopes` in the parameters is an *addition* the caller may ask for (a page that knows which record
 * it is showing); the providers' answer always wins by being there first (@@D-836).
 */
export default validation(
    async ({lib: {type}}) =>
        function blobScopeIssue() {
            return {
                params: type.Object({scopes: type.Optional(type.Array(type.String()))}),
                result: type.Object({scopes: type.Array(type.String()), expiresIn: type.Number()}),
            };
        },
);
