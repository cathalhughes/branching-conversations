import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../contexts/StoreContext';
import CollaboratorsPanel from './CollaboratorsPanel';

const DEMO_USERS = [
  { userId: 'user_demo_123', userName: 'Alex Chen', userEmail: 'alex@example.com', color: '#3B82F6' },
  { userId: 'user_demo_456', userName: 'Sarah Johnson', userEmail: 'sarah@example.com', color: '#10B981' },
  { userId: 'user_demo_789', userName: 'Mike Rodriguez', userEmail: 'mike@example.com', color: '#F59E0B' },
  { userId: 'user_demo_101', userName: 'Emma Davis', userEmail: 'emma@example.com', color: '#EF4444' },
];

interface ToolbarProps {
  onToggleActivityPanel?: () => void;
  showActivityPanel?: boolean;
  currentUser?: { userId: string; userName: string; userEmail: string; color: string };
  onUserChange?: (user: { userId: string; userName: string; userEmail: string; color: string }) => void;
  onBackToProjects?: () => void;
}

const Toolbar = observer(({ onToggleActivityPanel, showActivityPanel, currentUser, onUserChange, onBackToProjects }: ToolbarProps) => {
  const { conversationStore } = useStores();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCollaboratorsPanel, setShowCollaboratorsPanel] = useState(false);
  const [newTreeName, setNewTreeName] = useState('');
  const [newTreeDescription, setNewTreeDescription] = useState('');

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
    <div className="bg-gradient-to-r from-slate-800 via-purple-800 to-slate-800 border-b border-white border-opacity-10 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center space-x-6">
        {onBackToProjects && (
          <button
            onClick={onBackToProjects}
            className="flex items-center text-white text-opacity-70 hover:text-white transition-colors group"
          >
            <svg className="w-5 h-5 mr-2 group-hover:translate-x-[-2px] transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Projects
          </button>
        )}
        
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Branching Conversations
        </h1>
        
        <button
          onClick={() => setShowCreateDialog(true)}
          className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
        >
          New Conversation
        </button>

        <button
          onClick={() => setShowCollaboratorsPanel(true)}
          className="flex items-center space-x-2 text-white text-opacity-70 hover:text-white px-3 py-2 rounded-lg bg-white bg-opacity-10 hover:bg-opacity-20 backdrop-blur-sm border border-white border-opacity-20 transition-all duration-200 hover:scale-105"
          title="Manage Collaborators"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-sm">Collaborators</span>
        </button>

        {onToggleActivityPanel && (
          <button
            onClick={onToggleActivityPanel}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg backdrop-blur-sm border transition-all duration-200 hover:scale-105 ${
              showActivityPanel 
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg border-blue-400 border-opacity-50' 
                : 'text-white text-opacity-70 hover:text-white bg-white bg-opacity-10 hover:bg-opacity-20 border-white border-opacity-20'
            }`}
            title={showActivityPanel ? 'Hide Activity Panel' : 'Show Activity Panel'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-sm">{showActivityPanel ? 'Hide Activity' : 'Show Activity'}</span>
          </button>
        )}
      </div>

      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-800 border border-white border-opacity-20 rounded-2xl p-6 w-96 max-w-full mx-4 backdrop-blur-xl shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">Create New Conversation</h2>
            
            <form onSubmit={handleCreateTree}>
              <div className="mb-4">
                <label htmlFor="tree-name" className="block text-sm font-semibold text-white mb-2">
                  Name *
                </label>
                <input
                  id="tree-name"
                  type="text"
                  value={newTreeName}
                  onChange={(e) => setNewTreeName(e.target.value)}
                  placeholder="e.g., Frontend Development"
                  className="w-full border border-white border-opacity-20 rounded-lg px-3 py-2 bg-white bg-opacity-10 backdrop-blur-sm text-white placeholder-white placeholder-opacity-50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                  required
                />
              </div>

              <div className="mb-6">
                <label htmlFor="tree-description" className="block text-sm font-semibold text-white mb-2">
                  Description
                </label>
                <textarea
                  id="tree-description"
                  value={newTreeDescription}
                  onChange={(e) => setNewTreeDescription(e.target.value)}
                  placeholder="Optional description of this conversation topic"
                  rows={3}
                  className="w-full border border-white border-opacity-20 rounded-lg px-3 py-2 bg-white bg-opacity-10 backdrop-blur-sm text-white placeholder-white placeholder-opacity-50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateDialog(false)}
                  className="px-4 py-2 text-white text-opacity-70 hover:text-white bg-white bg-opacity-10 hover:bg-opacity-20 rounded-lg transition-all duration-200 hover:scale-105"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTreeName.trim() || conversationStore.isLoading}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
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