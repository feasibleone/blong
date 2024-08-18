import {library} from '@feasibleone/blong';

export default library(({lib: {error}}) => ({
    errors: error({
        jsonrpcEmpty: 'JSON RPC response without response and error',
        jsonrpcHttp: 'JSON RPC returned HTTP error {code}',
    }),
}));
