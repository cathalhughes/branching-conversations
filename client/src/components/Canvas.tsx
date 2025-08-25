import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  NodeTypes,
  OnConnect,
} from '@xyflow/react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../contexts/StoreContext';
import ConversationNodeComponent, { ConversationNodeData } from './ConversationNodeComponent';
import TreeHeaderNode, { TreeHeaderNodeData } from './TreeHeaderNode';
import '@xyflow/react/dist/style.css';

const nodeTypes: NodeTypes = {
  conversationNode: ConversationNodeComponent,
  treeHeaderNode: TreeHeaderNode,
};

const Canvas = observer(() => {
  const { conversationStore } = useStores();

  const { nodes, edges } = useMemo(() => {
    if (!conversationStore.canvas) {
      return { nodes: [], edges: [] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    conversationStore.canvas.trees.forEach((tree) => {
      // Add tree header node
      nodes.push({
        id: `tree-header-${tree.id}`,
        type: 'treeHeaderNode',
        position: tree.position,
        data: {
          tree,
          onDeleteTree: conversationStore.deleteConversationTree.bind(conversationStore),
        },
        draggable: true,
      });

      // Add conversation nodes
      tree.nodes.forEach((node) => {
        // Get node with streaming content if available
        const nodeWithStreaming = conversationStore.getNodeWithStreamingContent(tree.id, node.id) || node;
        
        nodes.push({
          id: node.id,
          type: 'conversationNode',
          position: node.position,
          data: {
            node: nodeWithStreaming,
            treeId: tree.id,
            rootNodeId: tree.rootNodeId,
            onSendMessage: async (prompt: string, nodeId: string, model?: string) => {
              try {
                await conversationStore.sendMessage({
                  treeId: tree.id,
                  nodeId: nodeId,
                  prompt,
                  model,
                });
              } catch (error) {
                console.error('Failed to send message:', error);
              }
            },
            onAddNode: async (parentNodeId: string) => {
              try {
                await conversationStore.addNewNodeBranch(tree.id, parentNodeId);
              } catch (error) {
                console.error('Failed to add new node:', error);
              }
            },
            onDeleteNode: async (nodeId: string) => {
              try {
                await conversationStore.deleteNode(tree.id, nodeId);
              } catch (error) {
                console.error('Failed to delete node:', error);
              }
            },
            isLoading: conversationStore.isNodeLoading(node.id),
          },
          draggable: true,
        });

        // Add edge from parent to this node
        if (node.parentId) {
          edges.push({
            id: `edge-${node.parentId}-${node.id}`,
            source: node.parentId,
            target: node.id,
            type: 'smoothstep',
            animated: nodeWithStreaming.isGenerating,
          });
        } else {
          // Connect root node to tree header
          edges.push({
            id: `edge-tree-${tree.id}-${node.id}`,
            source: `tree-header-${tree.id}`,
            target: node.id,
            type: 'smoothstep',
          });
        }
      });
    });

    return { nodes, edges };
  }, [conversationStore.canvas]);

  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges);

  // Update nodes when canvas changes
  React.useEffect(() => {
    setNodes(nodes);
    setEdges(edges);
  }, [nodes, edges, setNodes, setEdges]);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type === 'conversationNode') {
        const nodeData = node.data as any as ConversationNodeData;
        conversationStore.updateNodePosition(
          nodeData.treeId,
          node.id,
          node.position
        );
      } else if (node.type === 'treeHeaderNode') {
        const nodeData = node.data as any as TreeHeaderNodeData;
        conversationStore.updateTreePosition(
          nodeData.tree.id,
          node.position
        );
      }
    },
    [conversationStore]
  );

  // Remove global loading check - loading is now handled per-node

  if (conversationStore.error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-600">Error: {conversationStore.error}</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
});

export default Canvas;