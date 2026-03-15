import {library} from '@feasibleone/blong/types';

export default library(({lib: {error}}) => {
    error({
        openapiNamespaceNotDefined: 'Namespace {namespace} is not defined',
    });
});
