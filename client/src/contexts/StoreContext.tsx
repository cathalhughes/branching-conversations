import React, { createContext, useContext } from 'react';
import { conversationStore } from '../stores/ConversationStore';

const StoreContext = createContext({
  conversationStore,
});

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <StoreContext.Provider value={{ conversationStore }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStores = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStores must be used within a StoreProvider');
  }
  return context;
};