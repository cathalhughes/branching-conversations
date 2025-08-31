import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../contexts/StoreContext';
import CollaboratorsPanel from './CollaboratorsPanel';

const AI_MODELS = [
  { id: 'gpt-4.1-nano', name: 'GPT-4 Nano' },
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

const DEMO_USERS = [
  { userId: 'user_demo_123', userName: 'Alex Chen', userEmail: 'alex@example.com', color: '#3B82F6' },
  { userId: 'user_demo_456', userName: 'Sarah Johnson', userEmail: 'sarah@example.com', color: '#10B981' },
  { userId: 'user_demo_789', userName: 'Mike Rodriguez', userEmail: 'mike@example.com', color: '#F59E0B' },
  { userId: 'user_demo_101', userName: 'Emma Davis', userEmail: 'emma@example.com', color: '#EF4444' },
];

interface ToolbarProps {
  onToggleActivityPanel?: () => void;
  currentUser?: { userId: string; userName: string; userEmail: string; color: string };
  onUserChange?: (user: { userId: string; userName: string; userEmail: string; color: string }) => void;
  onBackToProjects?: () => void;
}

const Toolbar = observer(({ onToggleActivityPanel, currentUser, onUserChange, onBackToProjects }: ToolbarProps) => {
  const { conversationStore } = useStores();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCollaboratorsPanel, setShowCollaboratorsPanel] = useState(false);
  const [newTreeName, setNewTreeName] = useState('');
  const [newTreeDescription, setNewTreeDescription] = useState('');
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id);

  // Mock collaborators state (in real app, this would come from props or store)
  const [currentCollaborators, setCurrentCollaborators] = useState([
    currentUser ? {
      userId: currentUser.userId,
      userName: currentUser.userName,
      userEmail: currentUser.userEmail,
      color: currentUser.color
    } : DEMO_USERS[0]
  ]);

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

  const handleAddCollaborator = (user: { userId: string; userName: string; userEmail: string; color: string }) => {
    if (!currentCollaborators.some(collab => collab.userId === user.userId)) {
      setCurrentCollaborators([...currentCollaborators, user]);
    }
  };

  const handleRemoveCollaborator = (userId: string) => {
    if (userId !== currentUser?.userId) { // Don't allow removing the current user
      setCurrentCollaborators(currentCollaborators.filter(collab => collab.userId !== userId));
    }
  };

  const availableUsers = DEMO_USERS;

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        {onBackToProjects && (
          <button
            onClick={onBackToProjects}
            className="flex items-center text-gray-600 hover:text-gray-800 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Projects
          </button>
        )}
        
        <h1 className="text-xl font-semibold text-gray-800">
          Branching Conversations
        </h1>
        
        <button
          onClick={() => setShowCreateDialog(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors"
        >
          New Conversation
        </button>

        <button
          onClick={() => setShowCollaboratorsPanel(true)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
          title="Manage Collaborators"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-.5a4 4 0 110-5.292M21 21v-1a4 4 0 00-3-3.87" />
          </svg>
          <span className="text-sm">Collaborators</span>
        </button>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <label htmlFor="user-select" className="text-sm font-medium text-gray-700">
            Current User:
          </label>
          <select
            id="user-select"
            value={currentUser?.userId || DEMO_USERS[0].userId}
            onChange={(e) => {
              const user = DEMO_USERS.find(u => u.userId === e.target.value);
              if (user && onUserChange) {
                onUserChange(user);
              }
            }}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {DEMO_USERS.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.userName}
              </option>
            ))}
          </select>
        </div>

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

        {onToggleActivityPanel && (
          <button
            onClick={onToggleActivityPanel}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
            title="Toggle Activity Panel"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span className="text-sm">Activity</span>
          </button>
        )}
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

      {showCollaboratorsPanel && (
        <CollaboratorsPanel
          currentCollaborators={currentCollaborators}
          availableUsers={availableUsers}
          onAddCollaborator={handleAddCollaborator}
          onRemoveCollaborator={handleRemoveCollaborator}
          onClose={() => setShowCollaboratorsPanel(false)}
        />
      )}
    </div>
  );
});

export default Toolbar;