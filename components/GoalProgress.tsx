import React from 'react';

interface GoalProgressProps {
  metric: string;
  currentValue: number;
  targetValue: number;
  endDate: string;
  campaignName?: string;
}

const GoalProgress: React.FC<GoalProgressProps> = ({ metric, currentValue, targetValue, endDate, campaignName }) => {
  const progressPercentage = targetValue > 0 ? Math.min((currentValue / targetValue) * 100, 100) : 0;

  const daysRemaining = () => {
    const end = new Date(endDate);
    const now = new Date();
    // To ignore time part of date
    end.setUTCHours(0,0,0,0);
    now.setUTCHours(0,0,0,0);
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Ended';
    if (diffDays === 0) return 'Ends today';
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} left`;
  };

  return (
    <div className="bg-white dark:bg-navy-800 p-4 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50 flex flex-col justify-between">
      <div>
        {campaignName && (
          <span className="text-xs font-bold text-usace-red uppercase tracking-wider block mb-1">{campaignName}</span>
        )}
        <div className="flex justify-between items-start mb-2">
            <h4 className="font-semibold text-navy-800 dark:text-white truncate pr-2" title={metric}>{metric}</h4>
            <span className="text-xs font-medium text-gray-500 dark:text-navy-400 whitespace-nowrap flex-shrink-0">{daysRemaining()}</span>
        </div>
        <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-gray-700 dark:text-navy-300">{currentValue.toLocaleString()} / {targetValue.toLocaleString()}</span>
            <span className="font-bold text-usace-blue">{progressPercentage.toFixed(0)}%</span>
        </div>
      </div>
      <div className="w-full bg-gray-200 dark:bg-navy-700 rounded-full h-2.5">
        <div 
          className="bg-usace-blue h-2.5 rounded-full transition-all duration-500" 
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>
    </div>
  );
};

export default GoalProgress;