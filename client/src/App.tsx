import React, { useState, useEffect } from 'react';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { StoreProvider, useStores } from './contexts/StoreContext';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';
import { ActivityPanel } from './components/ActivityPanel';
import LandingPage from './components/LandingPage';
import CreatePage from './components/CreatePage';
import { Activity } from './types/activity.types';

// Canvas route component
const CanvasRoute = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { conversationStore } = useStores();
  const [showActivityPanel, setShowActivityPanel] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ userId: string; userName: string; userEmail: string; color: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }

    const loadCanvas = async () => {
      try {
        setIsLoading(true);
        setError(null);
        await conversationStore.loadCanvas(id);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load canvas:', err);
        setError('Failed to load canvas. You may not have access to this canvas.');
        setIsLoading(false);
      }
    };

    loadCanvas();
  }, [id, conversationStore, navigate]);

  // Set a demo user for now - in production this would come from auth
  useEffect(() => {
    if (!currentUser) {
      const demoUser = {
        userId: 'user_demo_123',
        userName: 'Alex Chen',
        userEmail: 'alex@example.com',
        color: '#3B82F6'
      };
      setCurrentUser(demoUser);
      conversationStore.setCurrentUser({
        userId: demoUser.userId,
        userName: demoUser.userName,
        userEmail: demoUser.userEmail,
      });
    }
  }, [currentUser, conversationStore]);

  const handleNavigateToLocation = (activity: Activity) => {
    console.log('Navigate to activity location:', activity);
  };

  const toggleActivityPanel = () => {
    setShowActivityPanel(!showActivityPanel);
  };

  const handleUserChange = (user: { userId: string; userName: string; userEmail: string; color: string }) => {
    setCurrentUser(user);
    conversationStore.setCurrentUser({
      userId: user.userId,
      userName: user.userName,
      userEmail: user.userEmail,
    });
  };

  const handleCanvasRefresh = () => {
    if (id) {
      conversationStore.loadCanvas(id);
    }
  };

  const handleBackToProjects = () => {
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-white text-xl">Loading canvas...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error}</div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Back Home
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-white text-xl">Setting up user...</div>
      </div>
    );
  }

  const canvasId = conversationStore.canvas?.id;

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

// Home route component (landing/create pages)
const HomeRoute = observer(() => {
  const navigate = useNavigate();
  const { conversationStore } = useStores();
  const [currentUser, setCurrentUser] = useState<{ userId: string; userName: string; userEmail: string; color: string } | null>(null);
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [showCreatePage, setShowCreatePage] = useState(false);

  useEffect(() => {
    if (currentUser) {
      conversationStore.setCurrentUser({
        userId: currentUser.userId,
        userName: currentUser.userName,
        userEmail: currentUser.userEmail,
      });
    }
  }, [currentUser?.userId, currentUser?.userName, currentUser?.userEmail, conversationStore]);

  const handleUserSelect = (user: { userId: string; userName: string; userEmail: string; color: string }) => {
    setCurrentUser(user);
    setShowLandingPage(false);
    setShowCreatePage(true);
  };

  const handleProjectSelect = (projectId: string) => {
    // Navigate to the canvas route
    navigate(`/canvas/${projectId}`);
  };

  const handleBackToLanding = () => {
    setCurrentUser(null);
    setShowLandingPage(true);
    setShowCreatePage(false);
  };

  if (showLandingPage || !currentUser) {
    return <LandingPage onUserSelect={handleUserSelect} />;
  }

  if (showCreatePage) {
    return (
      <CreatePage
        currentUser={currentUser}
        onProjectSelect={handleProjectSelect}
        onBackToLanding={handleBackToLanding}
      />
    );
  }

  return null;
});

// Main app content with routes
const AppContent = observer(() => {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/canvas/:id" element={<CanvasRoute />} />
    </Routes>
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
