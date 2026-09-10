import {
    Background,
    Controls,
    Edge,
    MarkerType,
    MiniMap,
    Node,
    ReactFlow,
    useEdgesState,
    useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import React, {useCallback, useEffect, useState} from 'react';

interface GraphNode {
    id: string;
    type: string;
    label: string;
    data: {
        name: string;
        config?: unknown;
        handlers?: string[];
        namespace?: string;
    };
    position?: {x: number; y: number};
}

interface GraphEdge {
    id: string;
    source: string;
    target: string;
    type?: string;
    label?: string;
}

interface GraphStructure {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

interface BlongGraphProps {
    apiUrl?: string;
}

/**
 * Custom node component for different types
 */
const CustomNode = ({data}: {data: GraphNode['data'] & {type: string; label: string}}) => {
    const getNodeStyle = (type: string) => {
        const baseStyle = {
            padding: '10px 20px',
            borderRadius: '8px',
            border: '2px solid',
            fontWeight: 'bold',
            minWidth: '120px',
            textAlign: 'center' as const,
        };

        switch (type) {
            case 'realm':
                return {
                    ...baseStyle,
                    borderColor: '#1976d2',
                    backgroundColor: '#e3f2fd',
                    color: '#0d47a1',
                };
            case 'layer':
                return {
                    ...baseStyle,
                    borderColor: '#388e3c',
                    backgroundColor: '#e8f5e9',
                    color: '#1b5e20',
                };
            case 'handler':
                return {
                    ...baseStyle,
                    borderColor: '#f57c00',
                    backgroundColor: '#fff3e0',
                    color: '#e65100',
                };
            case 'adapter':
                return {
                    ...baseStyle,
                    borderColor: '#7b1fa2',
                    backgroundColor: '#f3e5f5',
                    color: '#4a148c',
                };
            case 'orchestrator':
                return {
                    ...baseStyle,
                    borderColor: '#c62828',
                    backgroundColor: '#ffebee',
                    color: '#b71c1c',
                };
            default:
                return {
                    ...baseStyle,
                    borderColor: '#757575',
                    backgroundColor: '#f5f5f5',
                    color: '#424242',
                };
        }
    };

    return (
        <div style={getNodeStyle(data.type)}>
            <div style={{fontSize: '12px', marginBottom: '4px', opacity: 0.7}}>{data.type}</div>
            <div>{data.label}</div>
        </div>
    );
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
export const BlongGraph: React.FC<BlongGraphProps> = ({apiUrl = 'http://localhost:8080'}) => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

    useEffect(() => {
        const fetchGraphData = async () => {
            try {
                const response = await fetch(`${apiUrl}/rpc`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
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

                const graphData: GraphStructure = result.result;

                // Transform nodes for React Flow
                const flowNodes: Node[] = graphData.nodes.map(node => ({
                    id: node.id,
                    type: node.type,
                    position: node.position || {x: 0, y: 0},
                    data: {
                        ...node.data,
                        type: node.type,
                        label: node.label,
                    },
                }));

                // Transform edges for React Flow
                const flowEdges: Edge[] = graphData.edges.map(edge => ({
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
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load graph');
                setLoading(false);
            }
        };

        fetchGraphData();
    }, [apiUrl, setEdges, setNodes]);

    const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
        setSelectedNode(node.data as unknown as GraphNode);
    }, []);

    if (loading) {
        return (
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                }}
            >
                <div style={{fontSize: '24px', color: '#666'}}>Loading graph...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                }}
            >
                <div style={{fontSize: '18px', color: '#d32f2f'}}>Error: {error}</div>
            </div>
        );
    }

    return (
        <div style={{width: '100vw', height: '100vh', display: 'flex'}}>
            <div style={{flex: 1}}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    nodeTypes={nodeTypes}
                    fitView
                >
                    <Background />
                    <Controls />
                    <MiniMap />
                </ReactFlow>
            </div>
            {selectedNode && (
                <div
                    style={{
                        width: '300px',
                        padding: '20px',
                        backgroundColor: '#f5f5f5',
                        borderLeft: '1px solid #ddd',
                        overflowY: 'auto',
                    }}
                >
                    <h3 style={{marginTop: 0}}>Node Details</h3>
                    <div style={{marginBottom: '10px'}}>
                        <strong>Type:</strong> {selectedNode.type}
                    </div>
                    <div style={{marginBottom: '10px'}}>
                        <strong>Label:</strong> {selectedNode.label}
                    </div>
                    <div style={{marginBottom: '10px'}}>
                        <strong>Name:</strong> {selectedNode.data.name}
                    </div>
                    {selectedNode.data.namespace && (
                        <div style={{marginBottom: '10px'}}>
                            <strong>Namespace:</strong> {selectedNode.data.namespace}
                        </div>
                    )}
                    {!!selectedNode.data.config && (
                        <div style={{marginBottom: '10px'}}>
                            <strong>Config:</strong>
                            <pre
                                style={{
                                    backgroundColor: '#fff',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    overflow: 'auto',
                                }}
                            >
                                {JSON.stringify(selectedNode.data.config, null, 2)}
                            </pre>
                        </div>
                    )}
                    <button
                        onClick={() => setSelectedNode(null)}
                        style={{
                            marginTop: '10px',
                            padding: '8px 16px',
                            backgroundColor: '#1976d2',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }}
                    >
                        Close
                    </button>
                </div>
            )}
        </div>
    );
};
