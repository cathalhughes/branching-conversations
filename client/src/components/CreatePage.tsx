import React, { useState, useEffect, useCallback } from 'react';
import { useStores } from '../contexts/StoreContext';
import CreateProjectModal from './CreateProjectModal';

interface User {
  userId: string;
  userName: string;
  userEmail: string;
  color: string;
}

interface Project {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  collaborators: User[];
  isOwner: boolean;
  lastActivity: string;
}

interface CreatePageProps {
  currentUser: User;
  onProjectSelect: (projectId: string) => void;
  onBackToLanding: () => void;
}

const DEMO_USERS = [
  { userId: 'user_demo_123', userName: 'Alex Chen', userEmail: 'alex@example.com', color: '#3B82F6' },
  { userId: 'user_demo_456', userName: 'Sarah Johnson', userEmail: 'sarah@example.com', color: '#10B981' },
  { userId: 'user_demo_789', userName: 'Mike Rodriguez', userEmail: 'mike@example.com', color: '#F59E0B' },
  { userId: 'user_demo_101', userName: 'Emma Davis', userEmail: 'emma@example.com', color: '#EF4444' },
];


const CreatePage: React.FC<CreatePageProps> = ({ currentUser, onProjectSelect, onBackToLanding }) => {
  const { conversationStore } = useStores();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const handleCreateProject = async (projectData: { title: string; description: string; collaborators: User[] }) => {
    console.log('Creating project:', projectData);
    
    try {
      // Create the canvas with collaborators via the API
      const newCanvasId = await conversationStore.createCanvas({
        title: projectData.title,
        description: projectData.description,
        collaborators: projectData.collaborators,
      });
      
      // Store project info for local reference
      localStorage.setItem('currentProject', JSON.stringify({
        id: newCanvasId,
        title: projectData.title,
        description: projectData.description,
        collaborators: projectData.collaborators,
        createdAt: new Date().toISOString(),
        createdBy: currentUser
      }));
      
      // Navigate to the newly created canvas
      onProjectSelect(newCanvasId);
      
      // Refresh the projects list
      loadUserProjects();
    } catch (error) {
      console.error('Failed to create project:', error);
      // Show error to user instead of falling back to legacy canvas
      alert('Failed to create project. Please try again.');
    }
  };

  const loadUserProjects = useCallback(async () => {
    // Ensure current user is set in store before loading projects
    if (!conversationStore.currentUser) {
      conversationStore.setCurrentUser({
        userId: currentUser.userId,
        userName: currentUser.userName,
        userEmail: currentUser.userEmail,
      });
    }
    
    setIsLoadingProjects(true);
    try {
      const canvases = await conversationStore.getUserCanvases();
      
      // Transform backend canvases to Project format
      const projects: Project[] = canvases.map(canvas => ({
        id: canvas.id,
        title: canvas.title,
        description: canvas.description,
        createdAt: canvas.createdAt,
        collaborators: canvas.collaborators,
        isOwner: canvas.isOwner,
        lastActivity: canvas.lastActivity
      }));
      
      setUserProjects(projects);
    } catch (error) {
      console.error('Failed to load user projects:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  }, [conversationStore, currentUser]);

  const handleDeleteProject = async (project: Project) => {
    setProjectToDelete(project);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    
    try {
      await conversationStore.deleteCanvas(projectToDelete.id);
      await loadUserProjects(); // Refresh the list
      setShowDeleteConfirm(false);
      setProjectToDelete(null);
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project. Please try again.');
    }
  };

  const cancelDeleteProject = () => {
    setShowDeleteConfirm(false);
    setProjectToDelete(null);
  };

  // Load user projects when component mounts or user changes
  useEffect(() => {
    loadUserProjects();
  }, [currentUser.userId, loadUserProjects]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="relative z-10 min-h-screen p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={onBackToLanding}
            className="flex items-center text-white text-opacity-70 hover:text-opacity-100 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to User Selection
          </button>
          
          <div className="flex items-center text-white">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold mr-3"
              style={{ backgroundColor: currentUser.color }}
            >
              {currentUser.userName.split(' ').map(n => n[0]).join('')}
            </div>
            <span className="text-lg font-medium">{currentUser.userName}</span>
          </div>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Page Title */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Your Canvas
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"> Projects</span>
            </h1>
            <p className="text-xl text-white text-opacity-80 max-w-2xl mx-auto">
              Start a new conversation canvas or continue working on an existing project
            </p>
          </div>

          {/* Projects Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Create New Project Card */}
            <div
              className="group relative bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-8 cursor-pointer transform hover:scale-105 transition-all duration-300 shadow-2xl border border-white border-opacity-10"
              onClick={() => setShowCreateModal(true)}
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white bg-opacity-20 rounded-full mb-6">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Create New</h3>
                <p className="text-white text-opacity-80">
                  Start a fresh conversation canvas and invite collaborators
                </p>
              </div>
              
              {/* Hover effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
            </div>

            {/* Loading Projects */}
            {isLoadingProjects && (
              [...Array(2)].map((_, index) => (
                <div
                  key={`loading-${index}`}
                  className="group relative bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-6 border border-white border-opacity-20 shadow-xl animate-pulse"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="h-6 bg-white bg-opacity-20 rounded mb-2"></div>
                      <div className="h-4 bg-white bg-opacity-20 rounded mb-3 w-3/4"></div>
                    </div>
                    <div className="h-6 w-16 bg-white bg-opacity-20 rounded"></div>
                  </div>
                  <div className="flex items-center mb-4">
                    <div className="flex -space-x-2">
                      {[...Array(2)].map((_, i) => (
                        <div key={i} className="w-8 h-8 rounded-full bg-white bg-opacity-20"></div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-4 bg-white bg-opacity-20 rounded w-1/3"></div>
                    <div className="h-4 bg-white bg-opacity-20 rounded w-1/4"></div>
                  </div>
                </div>
              ))
            )}

            {/* Existing Projects */}
            {!isLoadingProjects && userProjects.map((project) => (
              <div
                key={project.id}
                className="group relative bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-6 border border-white border-opacity-20 hover:bg-opacity-20 transition-all duration-300 cursor-pointer transform hover:scale-105 shadow-xl"
                onClick={() => onProjectSelect(project.id)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-white mb-2 line-clamp-2">
                      {project.title}
                    </h3>
                    <p className="text-white text-opacity-70 text-sm mb-3 line-clamp-2">
                      {project.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {project.isOwner && (
                      <>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                            handleDeleteProject(project);
                          }}
                          className="group/delete relative p-2 text-red-400 hover:text-red-300 hover:bg-red-500 hover:bg-opacity-20 rounded-lg transition-all duration-200 z-10"
                          title="Delete project"
                          style={{ pointerEvents: 'auto' }}
                        >
                          <svg className="w-4 h-4 group-hover/delete:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <div className="flex items-center bg-blue-500 bg-opacity-30 text-blue-200 text-xs px-2 py-1 rounded-full">
                          Owner
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Collaborators */}
                <div className="flex items-center mb-4">
                  <div className="flex -space-x-2">
                    {project.collaborators.slice(0, 3).map((collaborator) => (
                      <div
                        key={collaborator.userId}
                        className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-semibold text-white"
                        style={{ backgroundColor: collaborator.color }}
                        title={collaborator.userName}
                      >
                        {collaborator.userName.split(' ').map(n => n[0]).join('')}
                      </div>
                    ))}
                    {project.collaborators.length > 3 && (
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-500 flex items-center justify-center text-xs font-semibold text-white">
                        +{project.collaborators.length - 3}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center text-sm text-white text-opacity-60">
                  <span>Last activity: {project.lastActivity}</span>
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>

                {/* Hover effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
              </div>
            ))}
          </div>

          {userProjects.length === 0 && (
            <div className="text-center mt-12">
              <p className="text-white text-opacity-60 text-lg">
                No projects yet. Create your first canvas to get started!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          currentUser={currentUser}
          availableUsers={DEMO_USERS.filter(user => user.userId !== currentUser.userId)}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateProject}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && projectToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-600">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-red-500 bg-opacity-20 rounded-full flex items-center justify-center mr-3">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white">Delete Project</h3>
            </div>
            
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete <strong>"{projectToDelete.title}"</strong>? 
              This action cannot be undone and will permanently remove all conversations and data in this canvas.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDeleteProject}
                className="px-4 py-2 text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProject}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatePage;