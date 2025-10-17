import React, { useState } from 'react';
import { Campaign } from '../types';
import { useNotification } from '../contexts/NotificationProvider';
import EmptyState from './EmptyState';

interface CampaignsProps {
  campaigns: Campaign[];
  onAddCampaign: (campaign: Omit<Campaign, 'id'>) => void;
}

const Campaigns: React.FC<CampaignsProps> = ({ campaigns, onAddCampaign }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState('');
    const { showToast } = useNotification();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !description || !startDate || !endDate) {
            showToast('Please fill out all fields.', 'error');
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            showToast('End date cannot be before the start date.', 'error');
            return;
        }
        onAddCampaign({ name, description, start_date: startDate, end_date: endDate });
        // Reset form
        setName('');
        setDescription('');
        setStartDate(new Date().toISOString().split('T')[0]);
        setEndDate('');
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
                    <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-6">Create Campaign</h2>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Campaign Name</label>
                            <input type="text" id="name" value={name} onChange={e => setName(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
                        </div>
                        <div>
                            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-navy-300">Description</label>
                            <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} required rows={3} className="mt-1 block w-full rounded-md border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm focus:border-usace-blue focus:ring-usace-blue sm:text-sm"/>
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
                                Create Campaign
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            <div className="lg:col-span-2">
                <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50">
                    <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-4">Existing Campaigns</h2>
                     {campaigns.length > 0 ? (
                        <div className="overflow-x-auto">
                            <ul className="divide-y divide-gray-200 dark:divide-navy-700">
                                {campaigns.map(campaign => (
                                    <li key={campaign.id} className="py-4">
                                        <h3 className="text-lg font-semibold text-usace-blue">{campaign.name}</h3>
                                        <p className="text-sm text-gray-600 dark:text-navy-300 mt-1">{campaign.description}</p>
                                        <p className="text-xs text-gray-500 dark:text-navy-400 mt-2">
                                            <span className="font-medium">Duration:</span> {campaign.start_date} to {campaign.end_date}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                     ) : (
                        <EmptyState title="No Campaigns Found" message="Create your first campaign using the form on the left." />
                     )}
                </div>
            </div>
        </div>
    );
};

export default Campaigns;