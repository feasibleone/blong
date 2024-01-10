import {library} from '../../../../types.js';

export default library(({lib: {error}}) => {
    error({
        openapiNamespaceNotDefined: 'Namespace {namespace} is not defined',
    });
});
