import {library} from '@feasibleone/blong';
import type {KukumLibContext} from '../../operation.ts';

/**
 * `kukum.tree.find` — realm → group → file structure.
 *
 * Joins the registry's own view (groups, ports, layer files) with the realm/file
 * index it built while loading, so `tree` shows what was actually mounted.
 */
export default library(
    () =>
        function treeFind(this: KukumLibContext, _params?: unknown) {
            const description = this.registry?.describe?.();
            if (!description) return {available: false as const};
            return {
                available: true as const,
                realms: description.realms.map(realm => ({
                    realm,
                    groups: description.folders
                        .filter(folder => folder.realm === realm)
                        .map(folder => folder.group),
                    files: description.files
                        .filter(file => file.realm === realm)
                        .map(file => file.file),
                })),
                ports: description.ports,
                layerFiles: description.layerFiles,
                groups: description.groups,
            };
        },
);
