import React, { useState, useMemo, useEffect } from 'react';
import { KpiGoal, Campaign } from '../types';
import { useNotification } from '../contexts/NotificationProvider';
import { METRIC_OPTIONS } from '../constants';
import EmptyState from './EmptyState';

interface GoalSetterProps {
  goals: KpiGoal[];
  onAddGoal: (goal: Omit<KpiGoal, 'id'>) => void;
  campaigns: Campaign[];
}

const GoalSetter: React.FC<GoalSetterProps> = ({ goals, onAddGoal, campaigns }) => {
    const [metric, setMetric] = useState('');
    const [targetValue, setTargetValue] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState('');
    const [campaignId, setCampaignId] = useState<string>('');
    const { showToast } = useNotification();

    const allMetrics = useMemo(() => {
        const uniqueMetrics = new Set(Object.values(METRIC_OPTIONS).flat());
        return Array.from(uniqueMetrics).sort();
    }, []);

    const campaignMap = useMemo(() => {
        return new Map(campaigns.map(c => [c.id, c.name]));
    }, [campaigns]);

    useEffect(() => {
        if (allMetrics.length > 0 && !metric) {
            setMetric(allMetrics[0]);
        }
    }, [allMetrics, metric]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!metric || !targetValue || !startDate || !endDate) {
            showToast('Please fill out all fields.', 'error');
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            showToast('End date cannot be before the start date.', 'error');
            return;
        }
        onAddGoal({ 
            metric, 
            target_value: parseInt(targetValue, 10), 
            start_date: startDate, 
            end_date: endDate,
            campaign_id: campaignId ? parseInt(campaignId, 10) : undefined,
        });
        // Reset form
        setTargetValue('');
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate('');
        setCampaignId('');
    };
    
    const sortedGoals = useMemo(() => {
        return [...goals].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    }, [goals]);


    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
                    <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-6">Set New KPI Goal</h2>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="metric" className="block text-sm font-medium text-gray-700 dark:text-navy-300">KPI Metric</label>
                            <select id="metric" value={metric} onChange={e => setMetric(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm">
                                {allMetrics.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                         <div>
                            <label htmlFor="campaign" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Campaign (Optional)</label>
                            <select id="campaign" value={campaignId} onChange={e => setCampaignId(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm">
                                <option value="">No specific campaign</option>
                                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="target-value" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Target Value</label>
                            <input type="number" id="target-value" value={targetValue} onChange={e => setTargetValue(e.target.value)} required placeholder="e.g., 100" className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Start Date</label>
                                <input type="date" id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
                            </div>
                            <div>
                                <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 dark:text-navy-300">End Date</label>
                                <input type="date" id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" className="inline-flex justify-center rounded-md border border-transparent bg-usace-blue py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 dark:focus:ring-offset-navy-800 transition-colors">
                                Set Goal
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            <div className="lg:col-span-2">
                <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
                    <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-4">Existing Goals</h2>
                     {sortedGoals.length > 0 ? (
                        <div className="overflow-y-auto max-h-[60vh]">
                            <ul className="divide-y divide-gray-200 dark:divide-navy-700">
                                {sortedGoals.map(goal => {
                                    const campaignName = goal.campaign_id ? campaignMap.get(goal.campaign_id) : null;
                                    return (
                                        <li key={goal.id} className="py-4">
                                            <h3 className="text-lg font-semibold text-usace-blue">{goal.metric}</h3>
                                            {campaignName && (
                                                <p className="text-xs font-medium text-usace-red uppercase tracking-wide mt-1">{campaignName}</p>
                                            )}
                                            <p className="text-sm text-gray-600 dark:text-navy-300 mt-1">
                                                Target: <span className="font-bold">{goal.target_value.toLocaleString()}</span>
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-navy-400 mt-2">
                                                <span className="font-medium">Duration:</span> {goal.start_date} to {goal.end_date}
                                            </p>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                     ) : (
                        <EmptyState title="No Goals Found" message="Set your first KPI goal using the form on the left." />
                     )}
                </div>
            </div>
        </div>
    );
};

export default GoalSetter;