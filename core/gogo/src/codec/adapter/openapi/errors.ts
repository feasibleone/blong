import {library} from '@feasibleone/blong';

export default library(({lib: {error}}) => {
    error({
        openapiNamespaceNotDefined: 'Namespace {namespace} is not defined',
    });
});
