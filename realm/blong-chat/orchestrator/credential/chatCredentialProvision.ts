import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `chat.credential.provision` — what a platform port learned, stored where it belongs.
 *
 * One method with two targets, because the port reports through one channel and the split is this
 * realm's knowledge: a token pair is the **workspace's** and goes to `chat_workspace`, while the app
 * ids and the signing secret are the **account's** and go to `chat_account` (`@@D-797`). An app
 * creation answers the second without the first, and a rotation the first without the second, so the
 * presence of `workspace` and `alias` decides which rows are touched.
 */
export default handler(
    ({
        handler: {
            'db/chatCredentialPersist': chatCredentialPersist,
            'db/chatCredentialWorkspacePersist': chatCredentialWorkspacePersist,
        },
    }) => ({
        async chatCredentialProvision(
            params: {platform?: string; alias?: string; workspace?: string} & Record<
                string,
                unknown
            >,
            $meta: IMeta,
        ): Promise<{updated: boolean}> {
            let updated = false;
            if (params.workspace !== undefined) {
                const stored = (await chatCredentialWorkspacePersist(params, $meta)) as {
                    updated: boolean;
                };
                updated = stored.updated || updated;
            }
            if (params.alias !== undefined) {
                const stored = (await chatCredentialPersist(params, $meta)) as {updated: boolean};
                updated = stored.updated || updated;
            }
            return {updated};
        },
    }),
);
