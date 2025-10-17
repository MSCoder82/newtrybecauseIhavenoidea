import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import Toast, { ToastData } from '../components/Toast';

interface NotificationContextType {
  showToast: (message: string, type: 'success' | 'error') => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastData | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  const handleClose = () => {
    setToast(null);
  };

  return (
    <NotificationContext.Provider value={{ showToast }}>
      {children}
      <Toast toast={toast} onClose={handleClose} />
    </NotificationContext.Provider>
  );
};
