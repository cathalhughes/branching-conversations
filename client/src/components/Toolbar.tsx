import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../contexts/StoreContext';

const AI_MODELS = [
  { id: 'gpt-4.1-nano', name: 'GPT-4 Nano' },
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

const Toolbar = observer(() => {
  const { conversationStore } = useStores();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTreeName, setNewTreeName] = useState('');
  const [newTreeDescription, setNewTreeDescription] = useState('');
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id);

  const handleCreateTree = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTreeName.trim()) return;

    const canvas = conversationStore.canvas;
    const treeCount = canvas?.trees.length || 0;
    
    await conversationStore.createConversationTree({
      name: newTreeName.trim(),
      description: newTreeDescription.trim() || undefined,
      position: {
        x: 50 + (treeCount * 350),
        y: 50,
      },
    });

    setNewTreeName('');
    setNewTreeDescription('');
    setShowCreateDialog(false);
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <h1 className="text-xl font-semibold text-gray-800">
          Branching Conversations
        </h1>
        
        <button
          onClick={() => setShowCreateDialog(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
        >
          New Conversation
        </button>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="model-select" className="text-sm font-medium text-gray-700">
            Default Model:
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {AI_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-sm text-gray-600">
          Trees: {conversationStore.canvas?.trees.length || 0}
        </div>
      </div>

      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Create New Conversation</h2>
            
            <form onSubmit={handleCreateTree}>
              <div className="mb-4">
                <label htmlFor="tree-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  id="tree-name"
                  type="text"
                  value={newTreeName}
                  onChange={(e) => setNewTreeName(e.target.value)}
                  placeholder="e.g., Frontend Development"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="mb-6">
                <label htmlFor="tree-description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="tree-description"
                  value={newTreeDescription}
                  onChange={(e) => setNewTreeDescription(e.target.value)}
                  placeholder="Optional description of this conversation topic"
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateDialog(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTreeName.trim() || conversationStore.isLoading}
                  className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

export default Toolbar;