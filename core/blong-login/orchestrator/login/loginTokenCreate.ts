import {type IMeta, handler} from '@feasibleone/blong';

type CredentialCheckResult = {
    userId: string;
    permissionMap: string;
    actions: string[];
};

export default handler(
    ({lib: {token}, handler: {accessCredentialCheck}}) =>
        async function loginTokenCreate(
            {username, password}: {username: string; password: string},
            $meta: IMeta,
        ) {
            const {userId, permissionMap, actions} = (await accessCredentialCheck(
                {username, password},
                // Forward $meta for tracing – the handler proxy attaches
                // the method name and routing info automatically.
                $meta,
            )) as CredentialCheckResult;

            return token({
                clientId: username,
                actorId: userId,
                sessionId: 'session',
                language: 'en',
                refresh: '',
                permissionMap,
                mlek: $meta?.auth?.mlek,
                mlsk: $meta?.auth?.mlsk,
                actions,
            });
        },
);
