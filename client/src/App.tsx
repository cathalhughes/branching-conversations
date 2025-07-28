import React from 'react';
import { StoreProvider } from './contexts/StoreContext';
import Toolbar from './components/Toolbar';
import Canvas from './components/Canvas';

function App() {
  return (
    <StoreProvider>
      <div className="h-screen flex flex-col bg-gray-50">
        <Toolbar />
        <div className="flex-1">
          <Canvas />
        </div>
      </div>
    </StoreProvider>
  );
}

export default App;
