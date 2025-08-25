import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { StoreProvider, useStores } from './contexts/StoreContext';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { ActivityPanel } from './components/ActivityPanel';
import { Activity } from './types/activity.types';

const AppContent = observer(() => {
  const { conversationStore } = useStores();
  const [isActivityPanelExpanded, setIsActivityPanelExpanded] = useState(false);
  const [showActivityPanel, setShowActivityPanel] = useState(true);

  // Mock user data - in real app this would come from authentication
  const mockUser = {
    userId: 'user_demo_123',
    userName: 'Demo User',
    userEmail: 'demo@example.com',
  };

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

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Toolbar onToggleActivityPanel={toggleActivityPanel} />
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
              userId={mockUser.userId}
              userName={mockUser.userName}
              userEmail={mockUser.userEmail}
              isExpanded={isActivityPanelExpanded}
              onToggleExpanded={toggleActivityPanelExpanded}
              onNavigateToLocation={handleNavigateToLocation}
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
