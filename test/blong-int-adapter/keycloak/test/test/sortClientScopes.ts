import {library} from '@feasibleone/blong';
export default library(() => ({
    sortClientScopes(result: {defaultClientScopes?: string[]}) {
        if (result.defaultClientScopes) {
            result.defaultClientScopes.sort();
        }
        return result;
    },
}));
