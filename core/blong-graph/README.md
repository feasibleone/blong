# Blong Graph

Graph visualization module for the Blong framework that enables runtime inspection and visualization of application structure.

![Blong Graph Visualization](https://github.com/user-attachments/assets/adeea00f-190a-48a5-8ace-913c935a1a5c)

## Features

- **Visual Architecture Map**: Visualize realms, layers, handlers, adapters, and orchestrators as an interactive graph
- **Runtime Inspection**: Click on components to inspect configuration, logs, metrics, and handlers
- **React Flow Integration**: Built on the well-established React Flow library for performant graph rendering
- **Interactive**: Zoom, pan, and explore your application architecture dynamically
- **Playwright Testing**: Visual regression testing with snapshots

## Usage

### Server Side

```typescript
import {realm} from '@feasibleone/blong';

export default realm(blong => ({
    url: import.meta.url,
    children: ['@feasibleone/blong-graph/server.js'],
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

```typescript
import {BlongGraph} from '@feasibleone/blong-graph/browser.js';

function App() {
    return <BlongGraph apiUrl="http://localhost:8080" />;
}
```

## Architecture Entities

The graph visualizes these key Blong framework concepts:

- **Realms**: Business domain boundaries (e.g., user realm, transfer realm)
- **Layers**: Functional groups within realms (gateway, adapter, orchestrator, error, test)
- **Handlers**: Individual functions implementing business operations
- **Adapters**: Components integrating with external systems (databases, APIs, services)
- **Orchestrators**: Business logic coordination between adapters

## Development

```bash
# Build
npm run build

# Run tests
npm run ci-test
```
