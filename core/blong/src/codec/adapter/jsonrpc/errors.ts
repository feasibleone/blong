import { library } from '../../../../types.js';

export default library(({lib: {error}}) => ({
    errors: error({
        'jsonrpc.empty': 'JSON RPC response without response and error',
        'jsonrpc.http': 'JSON RPC returned HTTP error {code}'
    })
}));
