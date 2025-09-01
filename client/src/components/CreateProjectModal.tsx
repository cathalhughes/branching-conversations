import React, { useState } from 'react';

interface User {
  userId: string;
  userName: string;
  userEmail: string;
  color: string;
}

interface CreateProjectModalProps {
  currentUser: User;
  availableUsers: User[];
  onClose: () => void;
  onSubmit: (projectData: { title: string; description: string; collaborators: User[] }) => void;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  currentUser,
  availableUsers,
  onClose,
  onSubmit
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCollaborators, setSelectedCollaborators] = useState<User[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCollaboratorToggle = (user: User) => {
    setSelectedCollaborators(prev => {
      const exists = prev.find(collab => collab.userId === user.userId);
      if (exists) {
        return prev.filter(collab => collab.userId !== user.userId);
      } else {
        return [...prev, user];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        collaborators: selectedCollaborators
      });
      onClose();
    } catch (error) {
      console.error('Error creating project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">Create New Project</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Project Details */}
            <div className="space-y-6 mb-8">
              <div>
                <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                  Project Title *
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="e.g., Product Strategy Discussion"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                  placeholder="Briefly describe what this project is about..."
                />
              </div>
            </div>

            {/* Collaborators Section */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Invite Collaborators
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Select team members to collaborate on this project. You can add more later.
              </p>

              {/* Current User (Always Included) */}
              <div className="mb-4">
                <div className="flex items-center p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm mr-3"
                    style={{ backgroundColor: currentUser.color }}
                  >
                    {currentUser.userName.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{currentUser.userName}</div>
                    <div className="text-sm text-gray-600">{currentUser.userEmail}</div>
                  </div>
                  <div className="text-sm font-medium text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
                    Owner
                  </div>
                </div>
              </div>

              {/* Available Collaborators */}
              <div className="space-y-2">
                {availableUsers.map((user) => {
                  const isSelected = selectedCollaborators.some(collab => collab.userId === user.userId);
                  return (
                    <div
                      key={user.userId}
                      className={`flex items-center p-3 border rounded-xl cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-green-50 border-green-200' 
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                      onClick={() => handleCollaboratorToggle(user)}
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
                      <div className="flex items-center">
                        <div className={`w-5 h-5 border-2 rounded ${
                          isSelected 
                            ? 'bg-green-500 border-green-500' 
                            : 'border-gray-300'
                        } flex items-center justify-center`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedCollaborators.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-xl">
                  <p className="text-sm text-blue-700 font-medium">
                    {selectedCollaborators.length} collaborator{selectedCollaborators.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() || isSubmitting}
                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
              >
                {isSubmitting ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </div>
                ) : (
                  'Create Project'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateProjectModal;