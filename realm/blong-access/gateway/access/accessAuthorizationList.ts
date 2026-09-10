import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function accessAuthorizationList() {
            return {
                params: type.Object({
                    permissionMap: type.Unknown(),
                    ttl: type.Optional(type.Number()),
                }),
                result: type.Array(type.String()),
            };
        },
);
