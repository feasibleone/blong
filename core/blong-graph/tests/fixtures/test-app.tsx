import React from 'react';
import ReactDOM from 'react-dom/client';
import {BlongGraph} from '../../BlongGraph.js';

// Mock data for testing
const mockGraphData = {
    nodes: [
        {
            id: 'realm-user',
            type: 'realm',
            label: 'user',
            data: {name: 'user', config: {port: 8080}},
            position: {x: 0, y: 0},
        },
        {
            id: 'layer-user-gateway',
            type: 'layer',
            label: 'gateway',
            data: {name: 'gateway'},
            position: {x: 0, y: 150},
        },
        {
            id: 'layer-user-adapter',
            type: 'layer',
            label: 'adapter',
            data: {name: 'adapter'},
            position: {x: 0, y: 250},
        },
        {
            id: 'handler-user-gateway-userGet',
            type: 'handler',
            label: 'userGet',
            data: {name: 'userGet', namespace: 'user.gateway'},
            position: {x: 0, y: 400},
        },
        {
            id: 'realm-transfer',
            type: 'realm',
            label: 'transfer',
            data: {name: 'transfer'},
            position: {x: 300, y: 0},
        },
        {
            id: 'layer-transfer-orchestrator',
            type: 'layer',
            label: 'orchestrator',
            data: {name: 'orchestrator'},
            position: {x: 300, y: 150},
        },
    ],
    edges: [
        {id: 'realm-user-layer-user-gateway', source: 'realm-user', target: 'layer-user-gateway', type: 'contains'},
        {id: 'realm-user-layer-user-adapter', source: 'realm-user', target: 'layer-user-adapter', type: 'contains'},
        {
            id: 'layer-user-gateway-handler-user-gateway-userGet',
            source: 'layer-user-gateway',
            target: 'handler-user-gateway-userGet',
            type: 'contains',
        },
        {
            id: 'realm-transfer-layer-transfer-orchestrator',
            source: 'realm-transfer',
            target: 'layer-transfer-orchestrator',
            type: 'contains',
        },
    ],
};

// Mock fetch for testing
(window as any).fetch = async (url: string, options: any) => {
    if (url.includes('/rpc')) {
        return {
            ok: true,
            json: async () => ({
                jsonrpc: '2.0',
                result: mockGraphData,
                id: 1,
            }),
        };
    }
    throw new Error('Unknown URL');
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <BlongGraph apiUrl="http://localhost:8080" />
    </React.StrictMode>
);
