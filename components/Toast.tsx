import React, { useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon } from './Icons';

export interface ToastData {
  message: string;
  type: 'success' | 'error';
}

interface ToastProps {
  toast: ToastData | null;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000); // Auto-dismiss after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  if (!toast) {
    return null;
  }

  const isSuccess = toast.type === 'success';
  const bgColor = isSuccess ? 'bg-green-100 dark:bg-green-900/80' : 'bg-red-100 dark:bg-red-900/80';
  const textColor = isSuccess ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200';
  const Icon = isSuccess ? CheckCircleIcon : XCircleIcon;

  return (
    <div className="fixed top-5 right-5 z-50 animate-fade-in-down max-w-sm">
      <div className={`flex items-center p-4 rounded-lg shadow-lg backdrop-blur-sm ${bgColor} ${textColor}`}>
        <Icon className="h-6 w-6 mr-3 flex-shrink-0" />
        <p className="text-sm font-medium">{toast.message}</p>
        <button onClick={onClose} className="ml-auto -mr-1 p-1 rounded-full hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-current">
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
        </button>
      </div>
    </div>
  );
};

export default Toast;
