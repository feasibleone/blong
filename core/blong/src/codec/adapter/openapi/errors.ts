import {library} from '../../../../types.js';

export default library(({lib: {error}}) => ({
    errors: error({
        'openapi.namespaceNotDefined': 'Namespace {namespace} is not defined',
    }),
}));
