import React from 'react';
import { DocumentMagnifyingGlassIcon } from './Icons';

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, message, icon: Icon = DocumentMagnifyingGlassIcon }) => {
  return (
    <div className="text-center bg-gray-50 dark:bg-navy-800/50 border-2 border-dashed border-gray-300 dark:border-navy-700 rounded-lg p-12 my-4">
      <Icon className="mx-auto h-12 w-12 text-gray-400 dark:text-navy-500" />
      <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-navy-400">{message}</p>
    </div>
  );
};

export default EmptyState;
