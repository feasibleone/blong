import type {IRegistryDescription} from '@feasibleone/blong/types';
import t from 'tap';

import {buildGraph} from './orchestrator/graph/graphGraphGet.ts';

/**
 * The graph handler's mapping, tested against a synthetic registry description.
 *
 * The realm-level round trip (loading a suite and reading the graph over RPC) is
 * worth having, but this covers the part that was actually broken: the old
 * handler walked a `registry.realm[*].layer[*].handler` shape the runtime never
 * produced, so it returned an empty graph for every input. Feeding it the real
 * `IRegistryDescription` shape is what pins that.
 */

const description: IRegistryDescription = {
    realms: ['srv', 'shop'],
    ports: ['srv.subject', 'shop.shopDispatch'],
    groups: [
        {name: 'srv.subject', handlerCount: 6},
        {name: 'shop.order', handlerCount: 2},
    ],
    folders: [
        {group: 'srv.subject', realm: 'srv', dir: 'orchestrator/subject'},
        {group: 'shop.order', realm: 'shop', dir: 'orchestrator/order'},
    ],
    files: [
        {file: 'orchestrator/subject/subjectModelList.ts', realm: 'srv'},
        {file: 'orchestrator/order/orderOrderAdd.ts', realm: 'shop'},
    ],
    layerFiles: [{file: 'adapter/layer.server.ts', realm: 'srv'}],
};

t.test('realms, ports, groups and files become nodes', t => {
    const {nodes} = buildGraph(description);
    const byId = new Map(nodes.map(node => [node.id, node]));

    t.equal(byId.get('realm-srv')?.type, 'realm', 'a realm is a realm node');
    t.equal(byId.get('realm-shop')?.type, 'realm', 'every realm is present');
    t.equal(
        byId.get('port-shop.shopDispatch')?.type,
        'orchestrator',
        'a dispatch port is labelled as an orchestrator',
    );
    t.equal(byId.get('port-srv.subject')?.type, 'adapter', 'other ports are adapters');
    t.equal(byId.get('group-srv.subject')?.type, 'layer', 'a handler group is a layer node');
    t.equal(
        byId.get('group-srv.subject')?.data.handlerCount,
        6,
        'the group carries its handler count',
    );
    t.equal(
        byId.get('file-orchestrator/order/orderOrderAdd.ts')?.type,
        'handler',
        'a source file is a handler node',
    );
    t.end();
});

t.test('containment edges follow the real structure', t => {
    const {edges} = buildGraph(description);

    t.ok(
        edges.some(e => e.source === 'realm-srv' && e.target === 'group-srv.subject'),
        'a realm contains its handler group',
    );
    t.ok(
        edges.some(
            e =>
                e.source === 'group-srv.subject' &&
                e.target === 'file-orchestrator/subject/subjectModelList.ts',
        ),
        'a group contains the files under its directory',
    );
    t.ok(
        edges.every(edge => edge.type === 'contains'),
        'only relationships the registry actually knows about are emitted',
    );
    t.end();
});

t.test('every edge points at a node that exists', t => {
    const {nodes, edges} = buildGraph(description);
    const ids = new Set(nodes.map(node => node.id));
    t.same(
        edges.filter(edge => !ids.has(edge.source) || !ids.has(edge.target)).map(e => e.id),
        [],
        'no dangling edges',
    );
    t.end();
});

t.test('an empty description yields an empty graph rather than throwing', t => {
    const empty = buildGraph({
        realms: [],
        ports: [],
        groups: [],
        folders: [],
        files: [],
        layerFiles: [],
    });
    t.same(empty, {nodes: [], edges: []}, 'nothing loaded, nothing drawn');
    t.end();
});
