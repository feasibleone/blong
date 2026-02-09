/**
 * Handler to retrieve the application graph structure
 */
const graphGraphGet = async function ({ registry }) {
    const nodes = [];
    const edges = [];
    // Get all realms from the registry
    const realms = registry?.realm || {};
    Object.entries(realms).forEach(([realmName, realmData], realmIndex) => {
        const realmId = `realm-${realmName}`;
        // Add realm node
        nodes.push({
            id: realmId,
            type: 'realm',
            label: realmName,
            data: {
                name: realmName,
                config: realmData.config,
            },
            position: { x: realmIndex * 300, y: 0 },
        });
        // Get layers from the realm
        const layers = realmData.layer || {};
        Object.entries(layers).forEach(([layerName, layerData], layerIndex) => {
            const layerId = `layer-${realmName}-${layerName}`;
            // Add layer node
            nodes.push({
                id: layerId,
                type: 'layer',
                label: layerName,
                data: {
                    name: layerName,
                },
                position: { x: realmIndex * 300, y: 150 + layerIndex * 100 },
            });
            // Add edge from realm to layer
            edges.push({
                id: `${realmId}-${layerId}`,
                source: realmId,
                target: layerId,
                type: 'contains',
            });
            // Get handlers from the layer
            const handlers = layerData.handler || {};
            Object.entries(handlers).forEach(([handlerName], handlerIndex) => {
                const handlerId = `handler-${realmName}-${layerName}-${handlerName}`;
                // Add handler node
                nodes.push({
                    id: handlerId,
                    type: 'handler',
                    label: handlerName,
                    data: {
                        name: handlerName,
                        namespace: `${realmName}.${layerName}`,
                    },
                    position: {
                        x: realmIndex * 300 + (handlerIndex % 3) * 100,
                        y: 300 + Math.floor(handlerIndex / 3) * 80,
                    },
                });
                // Add edge from layer to handler
                edges.push({
                    id: `${layerId}-${handlerId}`,
                    source: layerId,
                    target: handlerId,
                    type: 'contains',
                });
            });
        });
    });
    return { nodes, edges };
};
export default {
    graphGraphGet,
};
//# sourceMappingURL=index.js.map