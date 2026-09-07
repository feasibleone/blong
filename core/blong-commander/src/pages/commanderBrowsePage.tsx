import {Commander, useBlong, type ICommanderSource} from '@feasibleone/blong-browser';
import React, {useEffect, useState} from 'react';

/**
 * CommanderBrowsePage — mounts the Commander universal backend explorer.
 *
 * The configured source descriptors are fetched from the server
 * (`commander.source.list`, permission-filtered by the gateway) and passed
 * straight to the generic `Commander` shell; the shell itself drives the
 * tree/table/viewers via the declarative triples on each level.
 *
 * UI options come from the realm config `commander.*` (e.g.
 * `commander.showParentRow: false` disables the ".." up-to-parent row).
 */
export function CommanderBrowsePage() {
    const {handler, config} = useBlong();
    const [sources, setSources] = useState<ICommanderSource[] | null>(null);
    const [loadError, setLoadError] = useState<string | undefined>(undefined);

    const commanderConfig = (config as {commander?: {showParentRow?: boolean}}).commander ?? {};
    const showParentRow = commanderConfig.showParentRow ?? true;

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const result = (await handler.commanderSourceList({}, {})) as {
                    items?: ICommanderSource[];
                };
                if (cancelled) return;
                setSources(result.items ?? []);
            } catch (err) {
                if (cancelled) return;
                setLoadError((err as Error)?.message ?? 'Failed to load commander sources.');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [handler]);

    if (loadError) {
        return (
            <div className="commander-page" style={{height: '100%'}}>
                <div className="commander-page-error">{loadError}</div>
            </div>
        );
    }

    return (
        <div className="commander-page" style={{height: '100%'}}>
            {sources === null ? (
                <div className="commander-page-loading">Loading commander…</div>
            ) : (
                <Commander sources={sources} showParentRow={showParentRow} />
            )}
        </div>
    );
}
