import React, { useState } from 'react';

interface User {
  userId: string;
  userName: string;
  userEmail: string;
  color: string;
}

interface CollaboratorsPanelProps {
  currentCollaborators: User[];
  availableUsers: User[];
  onAddCollaborator: (user: User) => void;
  onRemoveCollaborator: (userId: string) => void;
  onClose: () => void;
}

const CollaboratorsPanel: React.FC<CollaboratorsPanelProps> = ({
  currentCollaborators,
  availableUsers,
  onAddCollaborator,
  onRemoveCollaborator,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredAvailableUsers = availableUsers.filter(user =>
    !currentCollaborators.some(collab => collab.userId === user.userId) &&
    (user.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
     user.userEmail.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Project Collaborators</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Current Collaborators */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Current Collaborators ({currentCollaborators.length})
            </h3>
            {currentCollaborators.length > 0 ? (
              <div className="space-y-3">
                {currentCollaborators.map((user) => (
                  <div
                    key={user.userId}
                    className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-xl"
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm mr-3"
                      style={{ backgroundColor: user.color }}
                    >
                      {user.userName.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{user.userName}</div>
                      <div className="text-sm text-gray-600">{user.userEmail}</div>
                    </div>
                    <button
                      onClick={() => onRemoveCollaborator(user.userId)}
                      className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                      title="Remove collaborator"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No other collaborators yet</p>
            )}
          </div>

          {/* Add New Collaborators */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Add New Collaborators
            </h3>
            
            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search users by name or email..."
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            {/* Available Users */}
            {filteredAvailableUsers.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredAvailableUsers.map((user) => (
                  <div
                    key={user.userId}
                    className="flex items-center p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => onAddCollaborator(user)}
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm mr-3"
                      style={{ backgroundColor: user.color }}
                    >
                      {user.userName.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{user.userName}</div>
                      <div className="text-sm text-gray-600">{user.userEmail}</div>
                    </div>
                    <button
                      className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition-colors"
                      title="Add collaborator"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                {searchTerm ? (
                  <p className="text-gray-500">No users found matching "{searchTerm}"</p>
                ) : (
                  <p className="text-gray-500">All available users are already collaborators</p>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end pt-6 border-t border-gray-200 mt-6">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaboratorsPanel;