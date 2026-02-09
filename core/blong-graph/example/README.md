# Blong Graph Example

This example demonstrates how to use the blong-graph module to visualize your Blong application architecture.

## Running the Example

### Server Side

Create a Blong server that includes the graph module:

```typescript
// server.ts
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    children: [
        '@feasibleone/blong-graph/server.js',
        // your other modules...
    ],
    config: {
        default: {
            graphDispatch: {
                namespace: 'graph',
            }
        }
    }
}));
```

### Browser Side

Create a React application that uses the BlongGraph component:

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import {BlongGraph} from '@feasibleone/blong-graph/browser.js';

const App = () => {
    return (
        <div style={{width: '100vw', height: '100vh'}}>
            <BlongGraph apiUrl="http://localhost:8080" />
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
```

## Features

- **Interactive Graph**: Zoom, pan, and navigate through your application's architecture
- **Node Inspection**: Click on any node to see details (configuration, handlers, etc.)
- **Multiple Entity Types**: Visualizes realms, layers, handlers, adapters, and orchestrators
- **Real-time Data**: Fetches current application structure from the running server

## Architecture Entities

The graph will display:

- **Realms** (Blue): Business domain boundaries
- **Layers** (Green): Functional groups within realms (gateway, adapter, orchestrator, etc.)
- **Handlers** (Orange): Individual functions implementing operations
- **Adapters** (Purple): Integration with external systems
- **Orchestrators** (Red): Business logic coordination

## API Endpoint

The graph data is available at:

```
POST /rpc
{
    "jsonrpc": "2.0",
    "method": "graph.graph.get",
    "params": {},
    "id": 1
}
```

Response format:

```json
{
    "jsonrpc": "2.0",
    "result": {
        "nodes": [
            {
                "id": "realm-user",
                "type": "realm",
                "label": "user",
                "data": {
                    "name": "user",
                    "config": {...}
                },
                "position": {"x": 0, "y": 0}
            }
        ],
        "edges": [
            {
                "id": "realm-user-layer-gateway",
                "source": "realm-user",
                "target": "layer-gateway",
                "type": "contains"
            }
        ]
    },
    "id": 1
}
```
