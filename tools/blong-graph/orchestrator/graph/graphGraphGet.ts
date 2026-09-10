import {type IRegistry, type IRegistryDescription, handler} from '@feasibleone/blong/types';

/**
 * Graph node representing a component in the Blong architecture.
 */
export interface GraphNode {
    id: string;
    type: 'realm' | 'layer' | 'handler' | 'adapter' | 'orchestrator';
    label: string;
    data: {
        name: string;
        dir?: string;
        handlerCount?: number;
        file?: string;
    };
    position?: {x: number; y: number};
}

/**
 * Graph edge representing a relationship between components.
 */
export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    type?: 'contains' | 'calls' | 'imports';
    label?: string;
}

/**
 * Complete graph structure of the application.
 */
export interface GraphStructure {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

/** Adapter/orchestrator instances carry the live registry (see `AdapterBase`). */
type GraphContext = {registry?: IRegistry};

const COLUMN = 320;
const ROW = 90;

const id = (...parts: string[]): string => parts.join('-');

/**
 * Turn the registry's structural snapshot into a graph a viewer can draw.
 *
 * Only relationships the registry actually knows about are emitted: containment
 * from realms to their ports and handler groups, and from a group to the files
 * that live under its directory. An earlier version of this handler invented
 * `calls`/`imports` edges from a `registry.realm[*].layer[*].handler` shape the
 * runtime does not have, which is why it always returned an empty graph.
 *
 * Exported so it can be unit tested against a synthetic description.
 */
export function buildGraph(description: IRegistryDescription): GraphStructure {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    description.realms.forEach((realm, index) => {
        nodes.push({
            id: id('realm', realm),
            type: 'realm',
            label: realm,
            data: {name: realm},
            position: {x: 0, y: index * ROW},
        });
    });

    description.ports.forEach((port, index) => {
        // A dispatch/schedule orchestrator is a port too; the id is the only
        // thing distinguishing the two, so the label says which it looks like.
        const isOrchestrator = /dispatch|schedule/i.test(port);
        nodes.push({
            id: id('port', port),
            type: isOrchestrator ? 'orchestrator' : 'adapter',
            label: port,
            data: {name: port},
            position: {x: COLUMN, y: index * ROW},
        });
    });

    description.folders.forEach((folder, index) => {
        nodes.push({
            id: id('group', folder.group),
            type: 'layer',
            label: folder.group,
            data: {
                name: folder.group,
                dir: folder.dir,
                handlerCount: description.groups.find(g => g.name === folder.group)?.handlerCount,
            },
            position: {x: COLUMN, y: description.ports.length * ROW + index * ROW},
        });
        if (description.realms.includes(folder.realm)) {
            edges.push({
                id: id('edge', folder.realm, folder.group),
                source: id('realm', folder.realm),
                target: id('group', folder.group),
                type: 'contains',
            });
        }
    });

    description.files.forEach((file, index) => {
        nodes.push({
            id: id('file', file.file),
            type: 'handler',
            label: file.file.split('/').pop() ?? file.file,
            data: {name: file.file, file: file.file},
            position: {
                x: COLUMN * 2,
                y: index * ROW,
            },
        });
        // Attach the file to whichever group directory contains it.
        const owner = description.folders
            .filter(folder => file.file.startsWith(folder.dir))
            .sort((a, b) => b.dir.length - a.dir.length)[0];
        if (owner) {
            edges.push({
                id: id('edge', owner.group, file.file),
                source: id('group', owner.group),
                target: id('file', file.file),
                type: 'contains',
            });
        }
    });

    description.layerFiles.forEach((layerFile, index) => {
        nodes.push({
            id: id('layer', layerFile.file),
            type: 'handler',
            label: layerFile.file.split('/').pop() ?? layerFile.file,
            data: {name: layerFile.file, file: layerFile.file},
            position: {x: COLUMN * 2, y: description.files.length * ROW + index * ROW},
        });
    });

    return {nodes, edges};
}

/**
 * graph.graph.get — the loaded architecture as data.
 *
 * Returns an empty graph when the registry cannot describe itself, so a viewer
 * renders "nothing loaded" rather than throwing.
 */
export default handler(
    () =>
        async function graphGraphGet(this: GraphContext): Promise<GraphStructure> {
            const description = this.registry?.describe?.();
            if (!description) return {nodes: [], edges: []};
            return buildGraph(description);
        },
);
