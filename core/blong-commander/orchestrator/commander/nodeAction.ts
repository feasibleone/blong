import {handler} from '@feasibleone/blong';

/**
 * commanderNodeAction — generic node actions available to commander clients.
 * Extended in later phases (copy path, open in tab, refresh, execute…).
 */
export default handler(
    () =>
        async function commanderNodeAction(
            params: {action?: string},
            _$meta: Record<string, unknown>,
        ) {
            const available = [
                {name: 'copyPath', title: 'Copy path'},
                {name: 'open', title: 'Open'},
                {name: 'refresh', title: 'Refresh'},
            ];
            if (!params.action) return {items: available};
            return available.find(action => action.name === params.action) ?? {error: 'Unknown action'};
        },
);
