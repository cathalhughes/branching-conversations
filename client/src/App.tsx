import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { StoreProvider, useStores } from './contexts/StoreContext';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { ActivityPanel } from './components/ActivityPanel';
import { Activity } from './types/activity.types';

const DEMO_USERS = [
  { userId: 'user_demo_123', userName: 'Alex Chen', userEmail: 'alex@example.com', color: '#3B82F6' },
  { userId: 'user_demo_456', userName: 'Sarah Johnson', userEmail: 'sarah@example.com', color: '#10B981' },
  { userId: 'user_demo_789', userName: 'Mike Rodriguez', userEmail: 'mike@example.com', color: '#F59E0B' },
  { userId: 'user_demo_101', userName: 'Emma Davis', userEmail: 'emma@example.com', color: '#EF4444' },
];

const AppContent = observer(() => {
  const { conversationStore } = useStores();
  const [isActivityPanelExpanded, setIsActivityPanelExpanded] = useState(false);
  const [showActivityPanel, setShowActivityPanel] = useState(true);
  const [currentUser, setCurrentUser] = useState(DEMO_USERS[0]);

  // Set initial user in store
  React.useEffect(() => {
    conversationStore.setCurrentUser({
      userId: currentUser.userId,
      userName: currentUser.userName,
      userEmail: currentUser.userEmail,
    });
  }, [currentUser.userId, currentUser.userName, currentUser.userEmail, conversationStore]);

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

  const toggleActivityPanelExpanded = () => {
    setIsActivityPanelExpanded(!isActivityPanelExpanded);
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
    conversationStore.loadCanvas();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Toolbar 
        onToggleActivityPanel={toggleActivityPanel} 
        currentUser={currentUser}
        onUserChange={handleUserChange}
      />
      <div className="flex-1 flex">
        <div className="flex-1">
          <Canvas />
        </div>
        {showActivityPanel && canvasId && (
          <div
            className={`
              border-l border-gray-200 bg-white transition-all duration-300 ease-in-out
              ${isActivityPanelExpanded ? 'w-96' : 'w-80'}
            `}
          >
            <ActivityPanel
              canvasId={canvasId}
              userId={currentUser.userId}
              userName={currentUser.userName}
              userEmail={currentUser.userEmail}
              isExpanded={isActivityPanelExpanded}
              onToggleExpanded={toggleActivityPanelExpanded}
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
