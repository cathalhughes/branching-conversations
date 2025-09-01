import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { StoreProvider, useStores } from './contexts/StoreContext';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { ActivityPanel } from './components/ActivityPanel';
import LandingPage from './components/LandingPage';
import CreatePage from './components/CreatePage';
import { Activity } from './types/activity.types';

const DEMO_USERS = [
  { userId: 'user_demo_123', userName: 'Alex Chen', userEmail: 'alex@example.com', color: '#3B82F6' },
  { userId: 'user_demo_456', userName: 'Sarah Johnson', userEmail: 'sarah@example.com', color: '#10B981' },
  { userId: 'user_demo_789', userName: 'Mike Rodriguez', userEmail: 'mike@example.com', color: '#F59E0B' },
  { userId: 'user_demo_101', userName: 'Emma Davis', userEmail: 'emma@example.com', color: '#EF4444' },
];

const AppContent = observer(() => {
  const { conversationStore } = useStores();
  const [showActivityPanel, setShowActivityPanel] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ userId: string; userName: string; userEmail: string; color: string } | null>(null);
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Set initial user in store when user is selected
  React.useEffect(() => {
    if (currentUser) {
      conversationStore.setCurrentUser({
        userId: currentUser.userId,
        userName: currentUser.userName,
        userEmail: currentUser.userEmail,
      });
    }
  }, [currentUser?.userId, currentUser?.userName, currentUser?.userEmail, conversationStore]);

  // Get real canvas ID from the store
  const canvasId = conversationStore.canvas?.id;

  const handleNavigateToLocation = (activity: Activity) => {
    console.log('Navigate to activity location:', activity);
    // Here you would implement navigation to the specific conversation/node
    // For example:
    // - If activity has conversationId, scroll to that conversation
    // - If activity has nodeId, highlight that node
    // - If activity has coordinates, pan the canvas to that location
  };

  const toggleActivityPanel = () => {
    setShowActivityPanel(!showActivityPanel);
  };


  const handleUserSelect = (user: { userId: string; userName: string; userEmail: string; color: string }) => {
    setCurrentUser(user);
    setShowLandingPage(false);
    setShowCreatePage(true);
    // The store will be updated via the useEffect above
  };

  const handleUserChange = (user: { userId: string; userName: string; userEmail: string; color: string }) => {
    setCurrentUser(user);
    // Update the store with the current user
    conversationStore.setCurrentUser({
      userId: user.userId,
      userName: user.userName,
      userEmail: user.userEmail,
    });
  };

  const handleCanvasRefresh = () => {
    if (conversationStore.canvas?.id) {
      conversationStore.loadCanvas(conversationStore.canvas.id);
    }
  };

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
    setShowCreatePage(false);
    // Load the specific canvas
    conversationStore.loadCanvas(projectId);
  };

  const handleBackToLanding = () => {
    setCurrentUser(null);
    setShowLandingPage(true);
    setShowCreatePage(false);
    setSelectedProjectId(null);
  };

  const handleBackToProjects = () => {
    setShowCreatePage(true);
    setSelectedProjectId(null);
  };

  // Show landing page if no user is selected
  if (showLandingPage || !currentUser) {
    return <LandingPage onUserSelect={handleUserSelect} />;
  }

  // Show create page if user is selected but no project is chosen
  if (showCreatePage && !selectedProjectId) {
    return (
      <CreatePage
        currentUser={currentUser}
        onProjectSelect={handleProjectSelect}
        onBackToLanding={handleBackToLanding}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" style={{ animationDelay: '4s' }}></div>
      </div>

      <Toolbar 
        onToggleActivityPanel={toggleActivityPanel} 
        showActivityPanel={showActivityPanel}
        currentUser={currentUser}
        onUserChange={handleUserChange}
        onBackToProjects={handleBackToProjects}
      />
      <div className="flex-1 flex relative z-10">
        <div className="flex-1 border-r border-white border-opacity-10">
          <Canvas />
        </div>
        {showActivityPanel && canvasId && (
          <div
            className="w-96 border-l border-white border-opacity-10 bg-transparent transition-all duration-500 ease-in-out"
          >
            <ActivityPanel
              canvasId={canvasId}
              userId={currentUser.userId}
              userName={currentUser.userName}
              userEmail={currentUser.userEmail}
              isExpanded={true}
              onNavigateToLocation={handleNavigateToLocation}
              onCanvasRefresh={handleCanvasRefresh}
            />
          </div>
        )}
      </div>
    </div>
  );
});

function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}

export default App;
