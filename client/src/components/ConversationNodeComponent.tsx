import React, { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { observer } from 'mobx-react-lite';
import { ConversationNode } from '../types/conversation.types';
import { conversationStore } from '../stores/ConversationStore';

export interface ConversationNodeData {
  node: ConversationNode;
  treeId: string;
  rootNodeId: string;
  onSendMessage: (prompt: string, nodeId: string, model?: string) => void;
  onAddNode: (parentNodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  isLoading?: boolean;
}

const ConversationNodeComponent = observer((props: NodeProps) => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4.1-nano');
  const [isEditing, setIsEditing] = useState(false);
  const [isResponseExpanded, setIsResponseExpanded] = useState(false);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const { node, treeId, rootNodeId, onSendMessage, onAddNode, onDeleteNode, isLoading } = props.data as any as ConversationNodeData;

  const availableModels = [
    { value: 'gpt-4.1-nano', label: 'gpt-4.1-nano' },
  ];

  // Initialize prompt and model from node if they exist
  React.useEffect(() => {
    if (node.prompt && !isEditing) {
      setPrompt(node.prompt);
    }
    if (node.model) {
      setSelectedModel(node.model);
    }
  }, [node.prompt, node.model, isEditing]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onSendMessage(prompt.trim(), node.id, selectedModel);
      setIsEditing(false);
    }
  };

  const handleAddNode = () => {
    onAddNode(node.id);
  };

  const handleDeleteNode = () => {
    const isRootNode = node.id === rootNodeId;
    const confirmMessage = isRootNode
      ? 'Are you sure you want to delete this entire conversation tree?'
      : 'Are you sure you want to delete this node and all its children?';
    
    if (window.confirm(confirmMessage)) {
      onDeleteNode(node.id);
    }
  };

  const startEditing = () => {
    setIsEditing(true);
    setPrompt(node.prompt || '');
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setPrompt(node.prompt || '');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (20MB limit)
    const maxSizeInBytes = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSizeInBytes) {
      alert(`File size exceeds 20MB limit. Your file is ${formatFileSize(file.size)}.`);
      event.target.value = ''; // Reset file input
      return;
    }

    setIsFileUploading(true);
    try {
      const success = await conversationStore.uploadFileToNode(treeId, node.id, file);
      
      if (success) {
        setShowFileUpload(false);
        // Reset file input
        event.target.value = '';
      }
    } catch (error) {
      console.error('File upload error:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsFileUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const hasContent = node.prompt || node.response;
  const isGenerating = node.isGenerating || isLoading;

  const displayResponse = node.response && node.response.length > 200 && !isResponseExpanded
    ? node.response.substring(0, 200) + '...'
    : node.response;

  // Show editing form if node has no prompt yet or user clicked edit
  const showPromptForm = !node.prompt || isEditing;

  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg p-4 min-w-[300px] max-w-[500px] shadow-md">
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      
      {/* Header with model info and timestamp */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-200 text-blue-800">
          Conversation Node
        </span>
        <div className="flex items-center gap-2">
          {node.model && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {node.model}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {new Date(node.timestamp).toLocaleTimeString()}
          </span>
          <button
            onClick={handleDeleteNode}
            disabled={isGenerating}
            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-red-50"
            title="Delete this node and all its children"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Prompt Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Prompt</h4>
          {node.prompt && !isEditing && (
            <button
              onClick={startEditing}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Edit
            </button>
          )}
        </div>
        
        {showPromptForm ? (
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div className="flex gap-2">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {availableModels.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt..."
              className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!prompt.trim() || isGenerating}
                className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Send'}
              </button>
              {node.prompt && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="text-sm bg-gray-500 text-white px-3 py-1 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : (
          <div 
            className="text-sm text-gray-700 bg-gray-50 rounded p-2 whitespace-pre-wrap cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={startEditing}
            title="Click to edit this prompt"
          >
            {node.prompt || "Click to edit this prompt"}
          </div>
        )}
      </div>

      {/* Response Section */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Response</h4>
        {isGenerating ? (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            Generating response...
          </div>
        ) : node.response ? (
          <div className="text-sm text-gray-700 bg-green-50 rounded p-3 whitespace-pre-wrap">
            {displayResponse}
            {node.response && node.response.length > 200 && (
              <button
                onClick={() => setIsResponseExpanded(!isResponseExpanded)}
                className="text-xs text-blue-600 hover:text-blue-800 mt-2 block"
              >
                {isResponseExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        ) : node.prompt ? (
          <div className="text-sm text-gray-400 italic">
            Response will appear here...
          </div>
        ) : (
          <div className="text-sm text-gray-400 italic">
            Enter a prompt to get started
          </div>
        )}
      </div>

      {/* File Attachments Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">File Attachments</h4>
          <button
            onClick={() => setShowFileUpload(!showFileUpload)}
            disabled={isGenerating}
            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showFileUpload ? 'Cancel' : '+ Add File'}
          </button>
        </div>

        {showFileUpload && (
          <div className="mb-3 p-2 bg-blue-50 rounded">
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={isFileUploading}
              className="text-xs w-full"
              accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.java,.cpp,.c,.cs,.php,.rb,.go,.rs,.scala,.kt,.sh,.sql,.xml,.html,.css,.scss,.less,.yaml,.yml,.toml,.ini,.cfg,.conf,.log,.pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx"
            />
            {isFileUploading && (
              <div className="text-xs text-blue-600 mt-1">
                Uploading file...
              </div>
            )}
          </div>
        )}

        {/* Display attachments */}
        <div className="space-y-2">
          {node.attachments && node.attachments.length > 0 ? (
            node.attachments.map((attachment) => (
              <div 
                key={attachment.id} 
                className={`text-xs p-2 rounded flex items-center justify-between ${
                  attachment.isInherited ? 'bg-yellow-50 border-l-2 border-yellow-400' : 'bg-gray-50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{attachment.originalName}</span>
                    {attachment.isInherited && (
                      <span className="text-yellow-600 text-xs">(inherited)</span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs">
                    {formatFileSize(attachment.size)} • {attachment.mimeType}
                    {attachment.isInherited && attachment.inheritedFromNodeId && (
                      <span> • from parent node</span>
                    )}
                  </div>
                </div>
                {!attachment.isInherited && (
                  <button
                    onClick={async () => {
                      if (window.confirm(`Are you sure you want to delete ${attachment.originalName}?`)) {
                        await conversationStore.deleteFileFromNode(treeId, node.id, attachment.id);
                      }
                    }}
                    className="text-red-600 hover:text-red-800 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-400 italic">
              No files attached. Files from parent nodes will appear here automatically.
            </div>
          )}
        </div>
      </div>

      {/* Add New Branch Button */}
      <button
        onClick={handleAddNode}
        disabled={isGenerating || !node.response}
        className="w-full text-sm bg-green-500 text-white px-3 py-2 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <span>+</span>
        Add New Branch
      </button>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  );
});

ConversationNodeComponent.displayName = 'ConversationNodeComponent';

export default ConversationNodeComponent;