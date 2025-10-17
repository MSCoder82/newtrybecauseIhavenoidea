import React from 'react';

const Spinner: React.FC = () => {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-navy-50 dark:bg-navy-950">
        <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-navy-200 dark:border-navy-700 rounded-full"></div>
            <div className="w-16 h-16 border-t-4 border-usace-blue rounded-full animate-spin absolute"></div>
        </div>
    </div>
  );
};

export default Spinner;
