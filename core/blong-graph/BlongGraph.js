import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, MarkerType, } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
/**
 * Custom node component for different types
 */
const CustomNode = ({ data }) => {
    const getNodeStyle = (type) => {
        const baseStyle = {
            padding: '10px 20px',
            borderRadius: '8px',
            border: '2px solid',
            fontWeight: 'bold',
            minWidth: '120px',
            textAlign: 'center',
        };
        switch (type) {
            case 'realm':
                return { ...baseStyle, borderColor: '#1976d2', backgroundColor: '#e3f2fd', color: '#0d47a1' };
            case 'layer':
                return { ...baseStyle, borderColor: '#388e3c', backgroundColor: '#e8f5e9', color: '#1b5e20' };
            case 'handler':
                return { ...baseStyle, borderColor: '#f57c00', backgroundColor: '#fff3e0', color: '#e65100' };
            case 'adapter':
                return { ...baseStyle, borderColor: '#7b1fa2', backgroundColor: '#f3e5f5', color: '#4a148c' };
            case 'orchestrator':
                return { ...baseStyle, borderColor: '#c62828', backgroundColor: '#ffebee', color: '#b71c1c' };
            default:
                return { ...baseStyle, borderColor: '#757575', backgroundColor: '#f5f5f5', color: '#424242' };
        }
    };
    return (_jsxs("div", { style: getNodeStyle(data.type), children: [_jsx("div", { style: { fontSize: '12px', marginBottom: '4px', opacity: 0.7 }, children: data.type }), _jsx("div", { children: data.label })] }));
};
const nodeTypes = {
    realm: CustomNode,
    layer: CustomNode,
    handler: CustomNode,
    adapter: CustomNode,
    orchestrator: CustomNode,
};
/**
 * Main BlongGraph component for visualizing application structure
 */
export const BlongGraph = ({ apiUrl = 'http://localhost:8080' }) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);
    useEffect(() => {
        const fetchGraphData = async () => {
            try {
                const response = await fetch(`${apiUrl}/rpc`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'graph.graph.get',
                        params: {},
                        id: 1,
                    }),
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const result = await response.json();
                if (result.error) {
                    throw new Error(result.error.message || 'Failed to fetch graph data');
                }
                const graphData = result.result;
                // Transform nodes for React Flow
                const flowNodes = graphData.nodes.map(node => ({
                    id: node.id,
                    type: node.type,
                    position: node.position || { x: 0, y: 0 },
                    data: {
                        ...node.data,
                        type: node.type,
                        label: node.label,
                    },
                }));
                // Transform edges for React Flow
                const flowEdges = graphData.edges.map(edge => ({
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    label: edge.label,
                    type: 'smoothstep',
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                    },
                }));
                setNodes(flowNodes);
                setEdges(flowEdges);
                setLoading(false);
            }
            catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load graph');
                setLoading(false);
            }
        };
        fetchGraphData();
    }, [apiUrl]);
    const onNodeClick = useCallback((_event, node) => {
        setSelectedNode(node.data);
    }, []);
    if (loading) {
        return (_jsx("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }, children: _jsx("div", { style: { fontSize: '24px', color: '#666' }, children: "Loading graph..." }) }));
    }
    if (error) {
        return (_jsx("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }, children: _jsxs("div", { style: { fontSize: '18px', color: '#d32f2f' }, children: ["Error: ", error] }) }));
    }
    return (_jsxs("div", { style: { width: '100vw', height: '100vh', display: 'flex' }, children: [_jsx("div", { style: { flex: 1 }, children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange, onNodeClick: onNodeClick, nodeTypes: nodeTypes, fitView: true, children: [_jsx(Background, {}), _jsx(Controls, {}), _jsx(MiniMap, {})] }) }), selectedNode && (_jsxs("div", { style: {
                    width: '300px',
                    padding: '20px',
                    backgroundColor: '#f5f5f5',
                    borderLeft: '1px solid #ddd',
                    overflowY: 'auto',
                }, children: [_jsx("h3", { style: { marginTop: 0 }, children: "Node Details" }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("strong", { children: "Type:" }), " ", selectedNode.type] }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("strong", { children: "Label:" }), " ", selectedNode.label] }), _jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("strong", { children: "Name:" }), " ", selectedNode.data.name] }), selectedNode.data.namespace && (_jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("strong", { children: "Namespace:" }), " ", selectedNode.data.namespace] })), selectedNode.data.config && (_jsxs("div", { style: { marginBottom: '10px' }, children: [_jsx("strong", { children: "Config:" }), _jsx("pre", { style: {
                                    backgroundColor: '#fff',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    overflow: 'auto',
                                }, children: JSON.stringify(selectedNode.data.config, null, 2) })] })), _jsx("button", { onClick: () => setSelectedNode(null), style: {
                            marginTop: '10px',
                            padding: '8px 16px',
                            backgroundColor: '#1976d2',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }, children: "Close" })] }))] }));
};
//# sourceMappingURL=BlongGraph.js.map