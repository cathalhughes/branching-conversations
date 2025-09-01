import React, { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { observer } from 'mobx-react-lite';
import { ConversationTree } from '../types/conversation.types';

export interface TreeHeaderNodeData {
  tree: ConversationTree;
  onDeleteTree: (treeId: string) => void;
  onAddFirstNode: (treeId: string) => void;
}

const TreeHeaderNode = observer((props: NodeProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { tree, onDeleteTree, onAddFirstNode } = props.data as any as TreeHeaderNodeData;
  const [editName, setEditName] = useState(tree.name);

  const handleSave = () => {
    // TODO: Implement tree name update
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${tree.name}"?`)) {
      onDeleteTree(tree.id);
    }
  };

  return (
    <div className="bg-purple-100 border-2 border-purple-300 rounded-lg p-4 min-w-[300px] shadow-md">
      <div className="flex items-center justify-between mb-2">
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="text-lg font-bold bg-transparent border-b border-purple-400 focus:outline-none focus:border-purple-600"
            autoFocus
          />
        ) : (
          <h3 
            className="text-lg font-bold text-purple-800 cursor-pointer hover:text-purple-600"
            onClick={() => setIsEditing(true)}
          >
            {tree.name}
          </h3>
        )}
        
        <button
          onClick={handleDelete}
          className="text-red-500 hover:text-red-700 text-sm font-medium"
        >
          Delete
        </button>
      </div>
      
      {tree.description && (
        <p className="text-sm text-purple-600 mb-2">{tree.description}</p>
      )}
      
      <div className="text-xs text-gray-500">
        Created: {new Date(tree.createdAt).toLocaleDateString()}
      </div>
      
      <div className="text-xs text-gray-500">
        Nodes: {tree.nodes.length}
      </div>

      {/* Add New Branch Button - always visible to allow multiple root nodes */}
      <button
        onClick={() => onAddFirstNode(tree.id)}
        className="mt-3 w-full text-sm bg-green-500 text-white px-3 py-2 rounded hover:bg-green-600 flex items-center justify-center gap-2"
      >
        <span>+</span>
        Add New Branch
      </button>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
});

TreeHeaderNode.displayName = 'TreeHeaderNode';

export default TreeHeaderNode;